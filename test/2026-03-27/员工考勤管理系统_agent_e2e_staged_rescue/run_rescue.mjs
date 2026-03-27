#!/usr/bin/env node

import path from "node:path";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const serverOrigin = "http://127.0.0.1:3000";
const runDate = "2026-03-27";
const runName = "员工考勤管理系统_agent_e2e_staged_rescue";
const runRoot = path.join(repoRoot, "test", runDate, runName);
const inputDir = path.join(runRoot, "input");
const processDir = path.join(runRoot, "process");
const outputDir = path.join(runRoot, "output");

const workspaceId = "e2e-attendance-staged-2026-03-27-20260327032705";
const workspaceKey = "e2e-attendance-staged-2026-03-27-20260327032705-398611bb48ea";
const workspaceDir = path.join(repoRoot, ".reqagent", "workspaces", workspaceKey);
const threadId = `thread-e2e-attendance-staged-rescue-${Date.now()}`;
const localThreadId = `local-e2e-attendance-staged-rescue-${Date.now()}`;
const requirementsPath = path.join(workspaceDir, "docs", "requirements.md");
const docxPath = path.join(workspaceDir, "docs", "员工考勤管理系统_用户需求说明书_成品.docx");

function visibleCharCount(text) {
  return text.replace(/\s+/g, "").length;
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

async function inspectDocx(targetPath) {
  const result = {
    exists: false,
    sizeBytes: 0,
    unzipOk: false,
    pythonDocxOk: false,
  };

  try {
    const stat = await fs.stat(targetPath);
    result.exists = true;
    result.sizeBytes = stat.size;
  } catch {
    return result;
  }

  try {
    await execFileAsync("unzip", ["-t", targetPath], { maxBuffer: 10 * 1024 * 1024 });
    result.unzipOk = true;
  } catch {
    result.unzipOk = false;
  }

  try {
    await execFileAsync(
      "python3",
      ["-c", "from docx import Document; import sys; Document(sys.argv[1]); print('ok')", targetPath],
      { maxBuffer: 10 * 1024 * 1024 },
    );
    result.pythonDocxOk = true;
  } catch {
    result.pythonDocxOk = false;
  }

  return result;
}

async function main() {
  await fs.mkdir(inputDir, { recursive: true });
  await ensureEmptyDir(processDir);
  await ensureEmptyDir(outputDir);

  const prompt = [
    "基于当前工作区已经存在的 `docs/requirements.md` 做最后一次增量补强，不要重写整篇。",
    "执行要求：",
    "1. 必须先调用 readFile 读取 `docs/requirements.md`。",
    "2. 然后调用 writeFile，使用 `append` 模式，只追加到第5章后部，不要删改已有结构。",
    "3. 追加以下正式正文子节：`#### 5.2.1 部署拓扑与容量规划`、`#### 5.2.2 接口集成与对账补偿`、`#### 5.2.3 监控告警与审计留痕`、`#### 5.2.4 容灾备份与恢复`、`#### 5.2.5 权限分级与数据安全`、`#### 5.2.6 运维发布与变更控制`。",
    "4. 每个子节必须写成正式送审风格，单节不少于 700 个中文可见字符，总增量不少于 5000 个中文可见字符。",
    "5. 追加完成后必须重新调用 export_docx，覆盖导出 `员工考勤管理系统_用户需求说明书_成品.docx`。",
    "6. 最终回复只说明 `docs/requirements.md` 路径、DOCX 路径、关键工具。",
  ].join("\n");

  await fs.writeFile(path.join(inputDir, "rescue_prompt.txt"), prompt, "utf8");

  const createThreadBody = { workspaceId, title: "员工考勤管理系统用户需求说明书-补强", id: threadId };
  const createThreadResult = await fetchJson(`${serverOrigin}/api/threads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createThreadBody),
  });
  await writeJson(path.join(processDir, "thread.create.request.json"), createThreadBody);
  await writeJson(path.join(processDir, "thread.create.response.json"), createThreadResult.json);

  const requestBody = {
    id: localThreadId,
    messageId: `msg-${randomUUID()}`,
    trigger: "submit-message",
    workspaceId,
    threadId,
    localThreadId,
    messages: [
      {
        id: `user-${randomUUID()}`,
        role: "user",
        parts: [{ type: "text", text: prompt }],
      },
    ],
  };
  await writeJson(path.join(processDir, "rescue.request.json"), requestBody);

  const response = await fetch(`${serverOrigin}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  await writeJson(path.join(processDir, "rescue.http.json"), {
    status: response.status,
    statusText: response.statusText,
    timeUtc: new Date().toISOString(),
  });

  if (!response.ok) {
    const text = await response.text();
    await fs.writeFile(path.join(processDir, "rescue.raw.txt"), text, "utf8");
    throw new Error(`HTTP ${response.status}`);
  }

  const raw = await readResponseStream(response);
  await fs.writeFile(path.join(processDir, "rescue.raw.txt"), raw, "utf8");

  const requirementsText = await fs.readFile(requirementsPath, "utf8");
  const docsEntries = await fs.readdir(path.join(workspaceDir, "docs"));
  const summary = {
    workspaceId,
    workspaceDir,
    threadId,
    requirementsPath,
    docxPath,
    visibleChars: visibleCharCount(requirementsText),
    docsEntries,
    docxInspection: await inspectDocx(docxPath),
  };

  await fs.writeFile(path.join(outputDir, "requirements_after_rescue.md"), requirementsText, "utf8");
  await writeJson(path.join(outputDir, "run_summary.json"), summary);
  await fs.writeFile(
    path.join(outputDir, "run_summary.md"),
    [
      "# Rescue Summary",
      `- workspaceId: ${workspaceId}`,
      `- requirementsPath: ${requirementsPath}`,
      `- docxPath: ${docxPath}`,
      `- visibleChars: ${summary.visibleChars}`,
      `- docs: ${docsEntries.join(", ")}`,
    ].join("\n"),
    "utf8",
  );

  console.log(JSON.stringify(summary, null, 2));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  try {
    await fs.mkdir(processDir, { recursive: true });
    await fs.writeFile(path.join(processDir, "run.error.log"), `${new Date().toISOString()}\n${message}\n`, "utf8");
  } catch {
    // ignore
  }
  console.error(message);
  process.exitCode = 1;
});
