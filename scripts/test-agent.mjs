/**
 * ReqAgent systematic flow test
 * Tests: single-turn tool call, multi-turn history, workspace tools, multi-step chaining
 * Run: node scripts/test-agent.mjs
 */

const BASE = "http://localhost:3000/api/chat";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function chat(messages, label) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log('='.repeat(60));

  const res = await fetch(BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });

  if (!res.ok) {
    console.error(`  HTTP ${res.status} ${res.statusText}`);
    return null;
  }

  const events = [];
  const text = await res.text();
  const lines = text.split("\n");

  for (const line of lines) {
    if (!line.startsWith("data: ")) continue;
    try {
      const ev = JSON.parse(line.slice(6));
      events.push(ev);
    } catch { /* ignore malformed */ }
  }

  return events;
}

function summarize(events, label) {
  if (!events) { console.log("  FAIL: no response"); return null; }

  const byType = {};
  for (const ev of events) {
    byType[ev.type] = (byType[ev.type] ?? 0) + 1;
  }

  const toolCalls = events
    .filter(e => e.type === "tool-input-available")
    .map(e => ({ name: e.toolName, id: e.toolCallId?.slice(-6) }));

  const toolResults = events
    .filter(e => e.type === "tool-output-available")
    .map(e => ({ id: e.toolCallId?.slice(-6), ok: e.output !== undefined, preview: JSON.stringify(e.output)?.slice(0, 120) }));

  const textChunks = events.filter(e => e.type === "text-delta").map(e => e.delta).join("");

  const toolErrors = events.filter(e => e.type === "tool-error");
  const stepCount = events.filter(e => e.type === "finish-step").length;
  const finalMeta = events.filter(e => e.type === "message-metadata").at(-1)?.messageMetadata;

  console.log(`  Steps completed:   ${stepCount}`);
  console.log(`  Tool calls:        ${toolCalls.length}`);
  for (const tc of toolCalls) {
    const result = toolResults.find(r => r.id === tc.id);
    const status = result ? (result.ok ? "✅" : "❌") : "⏳";
    console.log(`    ${status} ${tc.name} (${tc.id})`);
    if (result?.preview) console.log(`       → ${result.preview}`);
  }
  if (toolErrors.length > 0) {
    console.log(`  Tool errors:       ${toolErrors.length}`);
    for (const e of toolErrors) console.log(`    ❌ ${e.toolCallId}: ${JSON.stringify(e.error ?? e).slice(0, 100)}`);
  }
  console.log(`  Final activity:    ${finalMeta?.agentActivity ?? 'unknown'}`);
  console.log(`  Text length:       ${textChunks.length} chars`);
  if (textChunks.length > 0) {
    console.log(`  Text preview:      ${textChunks.slice(0, 200)}...`);
  }

  const passed = stepCount >= 1 && toolErrors.length === 0 && textChunks.length > 10;
  console.log(`  RESULT: ${passed ? '✅ PASS' : '❌ FAIL'}`);
  return { events, toolCalls, toolResults, textChunks, stepCount, toolErrors, finalMeta };
}

// ---------------------------------------------------------------------------
// Test 1: Single-turn — triggers search_knowledge
// ---------------------------------------------------------------------------
async function test1_singleTurnToolCall() {
  const messages = [{
    role: "user",
    content: "搜索教育类产品的知识库模式",
    parts: [{ type: "text", text: "搜索教育类产品的知识库模式" }],
  }];
  const events = await chat(messages, "单轮工具调用 — search_knowledge");
  return summarize(events, "test1");
}

// ---------------------------------------------------------------------------
// Test 2: Multi-turn — verifies tool history is preserved across rounds
// ---------------------------------------------------------------------------
async function test2_multiTurnHistory() {
  // Round 1
  const r1Messages = [{
    role: "user",
    content: "帮我分析一个在线教育平台的需求，包含课程管理",
    parts: [{ type: "text", text: "帮我分析一个在线教育平台的需求，包含课程管理" }],
  }];
  const r1Events = await chat(r1Messages, "多轮对话 — 第1轮");
  const r1 = summarize(r1Events, "round1");
  if (!r1) return;

  // Reconstruct assistant message from events for round 2
  // UIMessage format: part type = "tool-{toolName}", fields: input + output + state
  const assistantText = r1.textChunks;

  const toolInputEvents = r1Events.filter(e => e.type === "tool-input-available");
  const toolOutputEvents = r1Events.filter(e => e.type === "tool-output-available");

  const toolParts = toolInputEvents.map(e => {
    const outputEvent = toolOutputEvents.find(o => o.toolCallId === e.toolCallId);
    return {
      type: `tool-${e.toolName}`,
      toolCallId: e.toolCallId,
      state: outputEvent ? "output-available" : "input-available",
      input: e.input,
      ...(outputEvent ? { output: outputEvent.output } : {}),
    };
  });

  const r2Messages = [
    ...r1Messages,
    {
      role: "assistant",
      content: assistantText,
      parts: [
        ...toolParts,
        { type: "text", text: assistantText },
      ],
    },
    {
      role: "user",
      content: "继续，追加学生管理和作业系统的需求分析",
      parts: [{ type: "text", text: "继续，追加学生管理和作业系统的需求分析" }],
    },
  ];

  const r2Events = await chat(r2Messages, "多轮对话 — 第2轮（含历史）");
  return summarize(r2Events, "round2");
}

// ---------------------------------------------------------------------------
// Test 3: Workspace tools — list_files + search_workspace
// ---------------------------------------------------------------------------
async function test3_workspaceTools() {
  const messages = [{
    role: "user",
    content: "用 list_files 列出工作区文件，然后用 search_workspace 搜索 'requirements' 关键词",
    parts: [{ type: "text", text: "用 list_files 列出工作区文件，然后用 search_workspace 搜索 'requirements' 关键词" }],
  }];
  const events = await chat(messages, "Workspace 工具 — list_files + search_workspace");
  const result = summarize(events, "test3");

  if (result) {
    const toolNames = result.toolCalls.map(t => t.name);
    const hasListFiles = toolNames.includes("list_files");
    const hasSearchWorkspace = toolNames.includes("search_workspace");
    console.log(`  list_files called:       ${hasListFiles ? '✅' : '❌'}`);
    console.log(`  search_workspace called: ${hasSearchWorkspace ? '✅' : '❌'}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Test 4: Multi-step chaining — agent should call multiple tools in sequence
// ---------------------------------------------------------------------------
async function test4_multiStepChain() {
  const messages = [{
    role: "user",
    content: "先查看工作区有哪些文件，再搜索知识库关于电商的内容，最后给我一份综合分析",
    parts: [{ type: "text", text: "先查看工作区有哪些文件，再搜索知识库关于电商的内容，最后给我一份综合分析" }],
  }];
  const events = await chat(messages, "多步串联 — workspace + knowledge + 分析");
  const result = summarize(events, "test4");

  if (result) {
    console.log(`  Multi-step (≥2 tools): ${result.toolCalls.length >= 2 ? '✅' : '❌'} (${result.toolCalls.length} tools)`);
    console.log(`  Multi-step (≥2 steps): ${result.stepCount >= 2 ? '✅' : '❌'} (${result.stepCount} steps)`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Test 5: Empty workspace graceful — list_files on non-existent subdir
// ---------------------------------------------------------------------------
async function test5_gracefulError() {
  const messages = [{
    role: "user",
    content: "用 list_files 查看 'nonexistent_subdir' 这个目录里有什么",
    parts: [{ type: "text", text: "用 list_files 查看 'nonexistent_subdir' 这个目录里有什么" }],
  }];
  const events = await chat(messages, "工具容错 — 不存在的子目录");
  const result = summarize(events, "test5");
  if (result) {
    const hasError = result.toolErrors.length > 0;
    const recovered = result.textChunks.length > 0;
    console.log(`  Tool errored:    ${hasError ? '⚠️ yes' : '✅ no (graceful)'}`);
    console.log(`  Agent recovered: ${recovered ? '✅ yes' : '❌ no'}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------
console.log("ReqAgent Flow Test Suite");
console.log(new Date().toISOString());

(async () => {
  await test1_singleTurnToolCall();
  await test2_multiTurnHistory();
  await test3_workspaceTools();
  await test4_multiStepChain();
  await test5_gracefulError();
  console.log(`\n${'='.repeat(60)}`);
  console.log("All tests complete.");
})();
