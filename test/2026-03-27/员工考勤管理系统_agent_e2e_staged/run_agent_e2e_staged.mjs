#!/usr/bin/env node

import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const serverOrigin = "http://127.0.0.1:3000";
const runDate = "2026-03-27";
const runName = "员工考勤管理系统_agent_e2e_staged";
const runRoot = path.join(repoRoot, "test", runDate, runName);
const inputDir = path.join(runRoot, "input");
const processDir = path.join(runRoot, "process");
const outputDir = path.join(runRoot, "output");
const snapshotDir = path.join(outputDir, "snapshots");
const workspaceDocsDir = path.join(outputDir, "workspace_docs");
const workspaceSnapshotDir = path.join(outputDir, "workspace_snapshot");
const runStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const workspaceId = `e2e-attendance-staged-${runDate}-${runStamp}`;
const threadId = `thread-e2e-attendance-staged-${runDate}-${runStamp}`;
const localThreadId = `local-e2e-attendance-staged-${runDate}-${runStamp}`;
const minVisibleChars = 20_000;

function buildScopedKey(rawId) {
  const trimmed = String(rawId ?? "").trim();
  const safePrefix = trimmed
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const digest = createHash("sha1").update(trimmed).digest("hex").slice(0, 12);
  return safePrefix ? `${safePrefix}-${digest}` : digest;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function visibleCharCount(text) {
  return text.replace(/\s+/g, "").length;
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureEmptyDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
}

async function writeJson(filePath, data) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function fetchJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  let json = null;

  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 800)}`);
  }

  return { response, text, json };
}

async function readResponseStream(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }

  text += decoder.decode();
  return text;
}

async function waitForThreadMessages(targetThreadId, minCount = 2) {
  let lastPayload = null;

  for (let attempt = 1; attempt <= 40; attempt += 1) {
    const { json } = await fetchJson(`${serverOrigin}/api/threads/${encodeURIComponent(targetThreadId)}/messages`);
    lastPayload = json;
    const count = Array.isArray(json?.messages) ? json.messages.length : 0;
    if (count >= minCount) {
      return json;
    }
    await sleep(1500);
  }

  return lastPayload;
}

async function copyDirIfExists(source, destination) {
  await fs.rm(destination, { recursive: true, force: true });
  try {
    await fs.cp(source, destination, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

async function inspectDocx(docxPath) {
  const result = {
    exists: false,
    sizeBytes: 0,
    unzipOk: false,
    pythonDocxOk: false,
    pythonDocxError: null,
  };

  try {
    const stat = await fs.stat(docxPath);
    result.exists = true;
    result.sizeBytes = stat.size;
  } catch {
    return result;
  }

  try {
    await execFileAsync("unzip", ["-t", docxPath], { maxBuffer: 10 * 1024 * 1024 });
    result.unzipOk = true;
  } catch {
    result.unzipOk = false;
  }

  try {
    await execFileAsync(
      "python3",
      [
        "-c",
        ["from docx import Document", "import sys", "Document(sys.argv[1])", "print('ok')"].join("\n"),
        docxPath,
      ],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    result.pythonDocxOk = true;
  } catch (error) {
    result.pythonDocxOk = false;
    result.pythonDocxError = error instanceof Error ? error.message : String(error);
  }

  return result;
}

function getStagePrompts() {
  return [
    {
      key: "stage-1-init",
      prompt: [
        "你现在在真实 agent 对话流程的第一阶段。",
        "只允许做以下动作：",
        "1. 如有需要可先 list_files 或 readFile，但最终必须调用 writeFile。",
        "2. 用 writeFile 覆盖写入 `docs/requirements.md`。",
        "3. 本阶段只写这些内容：第1章、第2章、`3.1 功能分类`，以及 `3.2.1` 到 `3.2.4` 四个能力项。",
        "4. 文档标题固定为《员工考勤管理系统用户需求说明书》，风格必须是正式送审稿。",
        "5. `1.4` 必须是术语表，`2.4` 必须是部门职责表，`3.1` 必须是功能清单表。",
        "6. 每个能力项都必须包含：业务流程、业务功能详述、业务规则、输入要素表、输出要素表。",
        "7. 每个能力项正文密度要高，不要短句凑数；单个能力项正文至少 900 个中文可见字符，不含表头。",
        "8. 本阶段不要导出 DOCX，不要写完成总结。",
        "能力项名称固定为：`3.2.1 组织与考勤日历`、`3.2.2 班次规则管理`、`3.2.3 排班计划管理`、`3.2.4 打卡采集管理`。",
      ].join("\n"),
    },
    {
      key: "stage-2-feature-5-8",
      prompt: [
        "你现在在第二阶段，只做扩写追加。",
        "先 readFile `docs/requirements.md` 确认当前内容，然后调用 writeFile 追加，不允许 overwrite。",
        "本阶段只追加 `3.2.5` 到 `3.2.8` 四个能力项，不要重写已有章节。",
        "能力项名称固定为：`3.2.5 移动打卡管理`、`3.2.6 外勤打卡管理`、`3.2.7 请假管理`、`3.2.8 加班管理`。",
        "每个能力项都必须包含业务流程、业务功能详述、业务规则、输入要素表、输出要素表。",
        "每个能力项正文至少 900 个中文可见字符，不含表头。",
        "不要导出 DOCX，不要写总结。",
      ].join("\n"),
    },
    {
      key: "stage-3-feature-9-12",
      prompt: [
        "你现在在第三阶段，只做扩写追加。",
        "先 readFile `docs/requirements.md`，再用 writeFile append 追加。",
        "本阶段只追加 `3.2.9` 到 `3.2.12` 四个能力项。",
        "能力项名称固定为：`3.2.9 出差与外出管理`、`3.2.10 调休额度管理`、`3.2.11 异常识别与校验`、`3.2.12 补卡申诉管理`。",
        "每个能力项都必须包含业务流程、业务功能详述、业务规则、输入要素表、输出要素表。",
        "每个能力项正文至少 900 个中文可见字符，不含表头。",
        "不要导出 DOCX，不要写总结。",
      ].join("\n"),
    },
    {
      key: "stage-4-feature-13-16",
      prompt: [
        "你现在在第四阶段，只做扩写追加。",
        "先 readFile `docs/requirements.md`，再用 writeFile append 追加。",
        "本阶段只追加 `3.2.13` 到 `3.2.16` 四个能力项，以及 `3.3 特色系统需求`。",
        "能力项名称固定为：`3.2.13 审批通知协同`、`3.2.14 主管工作台`、`3.2.15 员工自助服务`、`3.2.16 月结、薪资接口与统计审计`。",
        "`3.3` 需要保留多个子项，用正式正文写清本期涉及与不涉及范围，不要空挂。",
        "每个能力项都必须包含业务流程、业务功能详述、业务规则、输入要素表、输出要素表。",
        "每个能力项正文至少 900 个中文可见字符，不含表头。",
        "不要导出 DOCX，不要写总结。",
      ].join("\n"),
    },
    {
      key: "stage-5-data-nfr-export",
      prompt: [
        "你现在在第五阶段，负责补齐第4章、第5章并导出成品。",
        "先 readFile `docs/requirements.md`，再用 writeFile append 追加。",
        "必须完整补齐 `4.1` 到 `4.15`，以及 `5.1 非功能性需求`、`5.2 系统需求`。",
        "第4章不能只写 是/否，要写成正式审阅文本；每个 `4.x` 至少 120 个中文可见字符。",
        "第5章必须覆盖性能、安全、可用性、审计、接口、部署、监控、容灾、运维、权限、日志、兼容性等要求，整体不少于 2500 个中文可见字符。",
        "追加完成后，必须调用 export_docx：",
        "- `sourcePath`: `docs/requirements.md`",
        "- `filename`: `员工考勤管理系统_用户需求说明书_成品`",
        "- `title`: `员工考勤管理系统用户需求说明书`",
        "- `version`: `V1.0`",
        "- `docDate`: `2026/03/27`",
        "最终回复里只说明路径和关键工具，不要写方案。",
      ].join("\n"),
    },
    {
      key: "stage-6-rescue",
      prompt: [
        "这是兜底增补阶段，只在正文长度仍不足 20000 时执行。",
        "先 readFile `docs/requirements.md`。",
        "然后用 writeFile overwrite 重写整篇 `docs/requirements.md`，但必须完整保留现有 1-5 章结构、16 个能力项名称、所有表格章节和导出文件名。",
        "你需要做的是在不删结构的前提下，把所有偏短的小节扩成正式审阅文本，尤其补强：`1.1-1.3`、`2.1-2.3`、`3.3`、`4.1-4.15`、`5.1-5.2`，以及每个能力项的业务功能详述和业务规则。",
        "目标：整篇 Markdown 不少于 22000 个中文可见字符。",
        "重写后再次调用 export_docx，参数与上一阶段完全一致。",
        "最终回复只说明路径和关键工具。",
      ].join("\n"),
    },
  ];
}

async function sendStage({
  index,
  prompt,
  workspaceId: currentWorkspaceId,
  threadId: currentThreadId,
  localThreadId: currentLocalThreadId,
}) {
  const requestBody = {
    id: currentLocalThreadId,
    messageId: `msg-${randomUUID()}`,
    trigger: "submit-message",
    workspaceId: currentWorkspaceId,
    threadId: currentThreadId,
    localThreadId: currentLocalThreadId,
    messages: [
      {
        id: `user-${randomUUID()}`,
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ],
  };

  await writeJson(path.join(processDir, `stage-${index}.request.json`), requestBody);

  const response = await fetch(`${serverOrigin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const headers = {};
  for (const [key, value] of response.headers.entries()) {
    headers[key] = value;
  }

  await writeJson(path.join(processDir, `stage-${index}.http.json`), {
    status: response.status,
    statusText: response.statusText,
    headers,
    timeUtc: nowIso(),
  });

  if (!response.ok) {
    const text = await response.text();
    await fs.writeFile(path.join(processDir, `stage-${index}.raw.txt`), text, "utf8");
    throw new Error(`Stage ${index} failed: HTTP ${response.status}`);
  }

  const raw = await readResponseStream(response);
  await fs.writeFile(path.join(processDir, `stage-${index}.raw.txt`), raw, "utf8");
  const messages = await waitForThreadMessages(currentThreadId, 2);
  await writeJson(path.join(processDir, `stage-${index}.messages.json`), messages);
}

async function main() {
  await fs.mkdir(inputDir, { recursive: true });
  await ensureEmptyDir(processDir);
  await ensureEmptyDir(outputDir);
  await fs.mkdir(snapshotDir, { recursive: true });

  const stagePrompts = getStagePrompts();
  for (let index = 0; index < stagePrompts.length; index += 1) {
    await fs.writeFile(
      path.join(inputDir, `${String(index + 1).padStart(2, "0")}-${stagePrompts[index].key}.txt`),
      stagePrompts[index].prompt,
      "utf8",
    );
  }

  const health = await fetch(`${serverOrigin}/`);
  if (!health.ok) {
    throw new Error(`App health check failed: ${health.status}`);
  }

  const createThreadBody = {
    workspaceId,
    title: "员工考勤管理系统用户需求说明书",
    id: threadId,
  };

  const createThreadResult = await fetchJson(`${serverOrigin}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createThreadBody),
  });

  await writeJson(path.join(processDir, "thread.create.request.json"), createThreadBody);
  await writeJson(path.join(processDir, "thread.create.response.json"), createThreadResult.json);

  const workspaceKey = buildScopedKey(workspaceId);
  const workspaceDir = path.join(repoRoot, ".reqagent", "workspaces", workspaceKey);
  const requirementsPath = path.join(workspaceDir, "docs", "requirements.md");
  const docxPath = path.join(workspaceDir, "docs", "员工考勤管理系统_用户需求说明书_成品.docx");
  const stageSummaries = [];

  for (let index = 0; index < 5; index += 1) {
    await sendStage({
      index: index + 1,
      prompt: stagePrompts[index].prompt,
      workspaceId,
      threadId,
      localThreadId,
    });

    const requirementsText = await fs.readFile(requirementsPath, "utf8").catch(() => "");
    const charCount = visibleCharCount(requirementsText);
    const docsEntries = await fs.readdir(path.join(workspaceDir, "docs")).catch(() => []);

    if (requirementsText) {
      await fs.writeFile(
        path.join(snapshotDir, `requirements.stage-${index + 1}.md`),
        requirementsText,
        "utf8",
      );
    }

    stageSummaries.push({
      stage: index + 1,
      key: stagePrompts[index].key,
      timeUtc: nowIso(),
      visibleChars: charCount,
      docsEntries,
    });
    await writeJson(path.join(processDir, `stage-${index + 1}.summary.json`), stageSummaries.at(-1));
  }

  let finalRequirementsText = await fs.readFile(requirementsPath, "utf8").catch(() => "");
  let finalVisibleChars = visibleCharCount(finalRequirementsText);

  if (finalVisibleChars < minVisibleChars) {
    await sendStage({
      index: 6,
      prompt: stagePrompts[5].prompt,
      workspaceId,
      threadId,
      localThreadId,
    });

    finalRequirementsText = await fs.readFile(requirementsPath, "utf8").catch(() => "");
    finalVisibleChars = visibleCharCount(finalRequirementsText);
    const docsEntries = await fs.readdir(path.join(workspaceDir, "docs")).catch(() => []);
    if (finalRequirementsText) {
      await fs.writeFile(path.join(snapshotDir, "requirements.stage-6.md"), finalRequirementsText, "utf8");
    }
    stageSummaries.push({
      stage: 6,
      key: stagePrompts[5].key,
      timeUtc: nowIso(),
      visibleChars: finalVisibleChars,
      docsEntries,
    });
    await writeJson(path.join(processDir, "stage-6.summary.json"), stageSummaries.at(-1));
  }

  const docsCopied = await copyDirIfExists(path.join(workspaceDir, "docs"), workspaceDocsDir);
  const snapshotCopied = await copyDirIfExists(workspaceDir, workspaceSnapshotDir);
  const docxInspection = await inspectDocx(docxPath);

  const summary = {
    runDate,
    runName,
    usedRealConversationRoute: true,
    stagedFlow: true,
    serverOrigin,
    workspaceId,
    workspaceKey,
    workspaceDir,
    threadId,
    localThreadId,
    requirementsPath,
    docxPath,
    visibleChars: finalVisibleChars,
    minVisibleChars,
    stages: stageSummaries,
    docsCopied,
    snapshotCopied,
    docxInspection,
  };

  await writeJson(path.join(outputDir, "run_summary.json"), summary);
  await fs.writeFile(
    path.join(outputDir, "run_summary.md"),
    [
      "# 员工考勤管理系统 Agent Staged E2E 运行结果",
      "",
      `- usedRealConversationRoute: true`,
      `- stagedFlow: true`,
      `- workspaceId: ${workspaceId}`,
      `- workspaceDir: ${workspaceDir}`,
      `- threadId: ${threadId}`,
      `- requirementsPath: ${requirementsPath}`,
      `- docxPath: ${docxPath}`,
      `- visibleChars: ${finalVisibleChars}`,
      `- minVisibleChars: ${minVisibleChars}`,
      `- docsCopied: ${docsCopied}`,
      `- snapshotCopied: ${snapshotCopied}`,
      "",
      "## Stages",
      ...stageSummaries.map(
        (stage) => `- stage ${stage.stage} (${stage.key}): chars=${stage.visibleChars}, docs=${stage.docsEntries.join(", ") || "无"}`,
      ),
    ].join("\n"),
    "utf8",
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  try {
    await fs.mkdir(processDir, { recursive: true });
    await fs.writeFile(path.join(processDir, "run.error.log"), `${nowIso()}\n${message}\n`, "utf8");
  } catch {
    // ignore
  }
  console.error(message);
  process.exitCode = 1;
});
