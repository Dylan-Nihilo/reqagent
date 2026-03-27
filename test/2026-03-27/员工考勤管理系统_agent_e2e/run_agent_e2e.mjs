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
const runName = "员工考勤管理系统_agent_e2e";
const runRoot = path.join(repoRoot, "test", runDate, runName);
const inputDir = path.join(runRoot, "input");
const processDir = path.join(runRoot, "process");
const outputDir = path.join(runRoot, "output");
const outputWorkspaceDocsDir = path.join(outputDir, "workspace_docs");
const outputWorkspaceSnapshotDir = path.join(outputDir, "workspace_snapshot");
const runStamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
const workspaceId = `e2e-attendance-${runDate}-${runStamp}`;
const requestedThreadId = `thread-e2e-attendance-${runDate}-${runStamp}`;
const localThreadId = `local-e2e-attendance-${runDate}-${runStamp}`;
const title = "员工考勤管理系统用户需求说明书";
const promptPath = path.join(inputDir, "agent_request.txt");
const maxAttempts = 3;
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

function timestamp() {
  return new Date().toISOString();
}

function visibleCharCount(text) {
  return text.replace(/\s+/g, "").length;
}

function extractUiMessagesFromStoreResponse(payload) {
  const entries = Array.isArray(payload?.messages) ? payload.messages : [];
  return entries
    .map((entry) => {
      const content = entry?.content;
      if (!content || typeof content !== "object" || typeof content.role !== "string" || !Array.isArray(content.parts)) {
        return null;
      }

      return {
        id: entry?.id,
        ...content,
      };
    })
    .filter(Boolean);
}

function extractToolCalls(messages) {
  const toolCalls = [];

  for (const message of messages) {
    if (message?.role !== "assistant" || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (typeof part?.type !== "string" || !part.type.startsWith("tool-")) continue;
      const derivedToolName =
        typeof part.toolName === "string"
          ? part.toolName
          : part.type === "tool-call"
            ? "unknown"
            : part.type.replace(/^tool-/, "");
      toolCalls.push({
        toolName: derivedToolName,
        toolCallId: typeof part.toolCallId === "string" ? part.toolCallId : undefined,
        status:
          typeof part?.status?.type === "string"
            ? part.status.type
            : typeof part?.state === "string"
              ? part.state
              : undefined,
        hasResult:
          (Object.prototype.hasOwnProperty.call(part, "result") && part.result !== undefined) ||
          (Object.prototype.hasOwnProperty.call(part, "output") && part.output !== undefined),
      });
    }
  }

  return toolCalls;
}

function extractAssistantTexts(messages) {
  return messages
    .filter((message) => message?.role === "assistant" && Array.isArray(message.parts))
    .map((message) =>
      message.parts
        .filter((part) => part?.type === "text" && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n"),
    )
    .filter(Boolean);
}

async function ensureCleanDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
  await fs.mkdir(dirPath, { recursive: true });
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
    throw new Error(`HTTP ${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }

  return {
    response,
    text,
    json,
  };
}

async function readResponseStream(response) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    fullText += decoder.decode(value, { stream: true });
  }

  fullText += decoder.decode();
  return fullText;
}

async function waitForMessages(threadId, minimumCount = 2) {
  let lastPayload = null;

  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const { json } = await fetchJson(`${serverOrigin}/api/threads/${encodeURIComponent(threadId)}/messages`);
    lastPayload = json;
    const uiMessages = extractUiMessagesFromStoreResponse(json);
    const assistantCount = uiMessages.filter((message) => message.role === "assistant").length;

    if (uiMessages.length >= minimumCount && assistantCount >= 1) {
      return {
        payload: json,
        uiMessages,
      };
    }

    await sleep(1500);
  }

  return {
    payload: lastPayload,
    uiMessages: extractUiMessagesFromStoreResponse(lastPayload),
  };
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
        [
          "from docx import Document",
          "import sys",
          "Document(sys.argv[1])",
          "print('ok')",
        ].join("\n"),
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

function buildFollowupPrompt({ charCount, docsFound, docxFound, attempt }) {
  return [
    `上一轮未满足交付门槛。当前是第 ${attempt} 次修正。`,
    `已检测到 docs/requirements.md 可见字符数为 ${charCount}，目标不少于 ${minVisibleChars}。`,
    `已检测到工作区 docs 文件：${docsFound.length > 0 ? docsFound.join("、") : "无"}。`,
    `DOCX 导出状态：${docxFound ? "已生成但需要连同正文一起加强" : "未生成，必须补齐导出" }。`,
    "请继续沿用同一项目流程，不要解释，不要总结方案，直接完成以下修正：",
    "1. 保持正式送审风格，扩写 docs/requirements.md 到不少于 20000 个中文可见字符。",
    "2. 保持 5 章结构完整，其中第 4 章覆盖 4.1-4.15，第 5 章补足可审阅正文，不要空泛短句。",
    "3. 第 3 章至少保留 16 个能力项，每个能力项继续包含业务流程、业务功能详述、业务规则、输入要素表、输出要素表。",
    "4. 必须重新调用 export_docx，覆盖导出 `员工考勤管理系统_用户需求说明书_成品.docx`。",
    "5. 最终回复继续说明 docs/requirements.md 路径、DOCX 路径，以及本轮实际调用的关键工具。",
  ].join("\n");
}

async function main() {
  await fs.mkdir(inputDir, { recursive: true });
  await ensureCleanDir(processDir);
  await ensureCleanDir(outputDir);
  await fs.mkdir(outputWorkspaceDocsDir, { recursive: true });

  const initialPrompt = await fs.readFile(promptPath, "utf8");

  const health = await fetch(`${serverOrigin}/`);
  if (!health.ok) {
    throw new Error(`App health check failed: ${health.status}`);
  }

  const createThreadBody = {
    workspaceId,
    title,
    id: requestedThreadId,
  };

  const createThreadResult = await fetchJson(`${serverOrigin}/api/threads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(createThreadBody),
  });

  await writeJson(path.join(processDir, "thread.create.request.json"), createThreadBody);
  await writeJson(path.join(processDir, "thread.create.response.json"), createThreadResult.json);

  const threadId = createThreadResult.json?.thread?.id ?? requestedThreadId;
  const workspaceKey = buildScopedKey(workspaceId);
  const workspaceDir = path.join(repoRoot, ".reqagent", "workspaces", workspaceKey);

  let currentMessages = [
    {
      id: `user-${randomUUID()}`,
      role: "user",
      parts: [
        {
          type: "text",
          text: initialPrompt,
        },
      ],
    },
  ];

  const attemptSummaries = [];
  let finalDocs = [];
  let finalDocxPath = null;
  let finalRequirementsPath = path.join(workspaceDir, "docs", "requirements.md");
  let finalCharCount = 0;
  let finalMessages = [];
  let finalToolCalls = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const requestBody = {
      id: localThreadId,
      messageId: `msg-${randomUUID()}`,
      trigger: "submit-message",
      workspaceId,
      threadId,
      localThreadId,
      messages: currentMessages,
    };

    await writeJson(path.join(processDir, `chat.attempt-${attempt}.request.json`), requestBody);

    const response = await fetch(`${serverOrigin}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const responseHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      responseHeaders[key] = value;
    }

    await writeJson(path.join(processDir, `chat.attempt-${attempt}.http.json`), {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
      timeUtc: timestamp(),
    });

    if (!response.ok) {
      const failedRaw = await response.text();
      await fs.writeFile(path.join(processDir, `chat.attempt-${attempt}.raw.txt`), failedRaw, "utf8");
      throw new Error(`Chat request failed on attempt ${attempt}: HTTP ${response.status}`);
    }

    const rawStream = await readResponseStream(response);
    await fs.writeFile(path.join(processDir, `chat.attempt-${attempt}.raw.txt`), rawStream, "utf8");

    const { payload, uiMessages } = await waitForMessages(threadId, currentMessages.length + 1);
    await writeJson(path.join(processDir, `chat.attempt-${attempt}.messages.json`), payload);

    finalMessages = uiMessages;
    finalToolCalls = extractToolCalls(uiMessages);

    let docsEntries = [];
    try {
      docsEntries = (await fs.readdir(path.join(workspaceDir, "docs"))).sort();
    } catch {
      docsEntries = [];
    }

    finalDocs = docsEntries;

    let requirementsText = "";
    try {
      requirementsText = await fs.readFile(finalRequirementsPath, "utf8");
    } catch {
      requirementsText = "";
    }

    finalCharCount = visibleCharCount(requirementsText);
    const docxFiles = docsEntries.filter((name) => name.toLowerCase().endsWith(".docx"));
    finalDocxPath = docxFiles.length > 0 ? path.join(workspaceDir, "docs", docxFiles[0]) : null;
    const toolNames = [...new Set(finalToolCalls.map((item) => item.toolName))];

    const summary = {
      attempt,
      timeUtc: timestamp(),
      docsEntries,
      requirementsExists: Boolean(requirementsText),
      requirementsVisibleChars: finalCharCount,
      docxFiles,
      keyToolCalls: toolNames,
      assistantMessageCount: uiMessages.filter((message) => message.role === "assistant").length,
    };
    attemptSummaries.push(summary);
    await writeJson(path.join(processDir, `chat.attempt-${attempt}.summary.json`), summary);

    const success = Boolean(requirementsText) && finalCharCount >= minVisibleChars && Boolean(finalDocxPath);
    if (success) {
      break;
    }

    if (attempt === maxAttempts) {
      break;
    }

    currentMessages = [
      ...uiMessages,
      {
        id: `user-${randomUUID()}`,
        role: "user",
        parts: [
          {
            type: "text",
            text: buildFollowupPrompt({
              charCount: finalCharCount,
              docsFound: docsEntries,
              docxFound: Boolean(finalDocxPath),
              attempt: attempt + 1,
            }),
          },
        ],
      },
    ];
  }

  const docsCopied = await copyDirIfExists(path.join(workspaceDir, "docs"), outputWorkspaceDocsDir);
  const snapshotCopied = await copyDirIfExists(workspaceDir, outputWorkspaceSnapshotDir);

  const docxInspection = finalDocxPath ? await inspectDocx(finalDocxPath) : null;
  const assistantTexts = extractAssistantTexts(finalMessages);
  const summary = {
    runDate,
    runName,
    usedRealConversationRoute: true,
    serverOrigin,
    workspaceId,
    workspaceKey,
    workspaceDir,
    threadId,
    localThreadId,
    promptPath,
    finalRequirementsPath,
    finalDocxPath,
    finalDocs,
    visibleChars: finalCharCount,
    minVisibleChars,
    attempts: attemptSummaries,
    toolCalls: finalToolCalls,
    docsCopied,
    snapshotCopied,
    docxInspection,
    assistantTextPreview: assistantTexts.at(-1)?.slice(0, 3000) ?? "",
  };

  await writeJson(path.join(outputDir, "run_summary.json"), summary);
  await fs.writeFile(
    path.join(outputDir, "run_summary.md"),
    [
      `# 员工考勤管理系统 Agent E2E 运行结果`,
      ``,
      `- runDate: ${runDate}`,
      `- usedRealConversationRoute: true`,
      `- serverOrigin: ${serverOrigin}`,
      `- workspaceId: ${workspaceId}`,
      `- workspaceDir: ${workspaceDir}`,
      `- threadId: ${threadId}`,
      `- requirementsPath: ${finalRequirementsPath}`,
      `- docxPath: ${finalDocxPath ?? "未生成"}`,
      `- visibleChars: ${finalCharCount}`,
      `- minVisibleChars: ${minVisibleChars}`,
      `- docsCopied: ${docsCopied}`,
      `- snapshotCopied: ${snapshotCopied}`,
      `- keyTools: ${[...new Set(finalToolCalls.map((item) => item.toolName))].join(", ") || "无"}`,
      ``,
      `## 工作区 docs`,
      ...(finalDocs.length > 0 ? finalDocs.map((item) => `- ${item}`) : ["- 无"]),
      ``,
      `## 尝试记录`,
      ...attemptSummaries.map(
        (item) =>
          `- attempt ${item.attempt}: chars=${item.requirementsVisibleChars}, docx=${item.docxFiles.join(", ") || "无"}, tools=${item.keyToolCalls.join(", ") || "无"}`,
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
    await fs.writeFile(path.join(processDir, "run.error.log"), `${timestamp()}\n${message}\n`, "utf8");
  } catch {
    // ignore secondary failure
  }
  console.error(message);
  process.exitCode = 1;
});
