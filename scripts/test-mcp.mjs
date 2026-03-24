import process from "node:process";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sanitizeSegment(value) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "server";
}

async function main() {
  const client = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: process.execPath,
      args: ["scripts/mock-mcp-server.mjs"],
    }),
  });

  try {
    const definitions = await client.listTools();
    assert(Array.isArray(definitions.tools), "MCP tools list did not return an array");
    assert(definitions.tools.length === 1, `Expected exactly 1 tool, got ${definitions.tools.length}`);

    const echoDefinition = definitions.tools.find((tool) => tool.name === "echo");
    assert(echoDefinition, "Missing echo tool definition");

    const prefixedToolName = `mcp.${sanitizeSegment("mock")}.${sanitizeSegment(echoDefinition.name)}`;
    assert(prefixedToolName === "mcp.mock.echo", `Unexpected prefixed tool name: ${prefixedToolName}`);

    const proxiedTools = client.toolsFromDefinitions(definitions);
    const echoTool = proxiedTools.echo;
    assert(echoTool, "toolsFromDefinitions did not create echo tool");

    const result = await echoTool.execute({ text: "Nova MCP smoke test" }, {
      toolCallId: "test-call-1",
      messages: [],
      abortSignal: undefined,
    });

    const textPart = result.content?.find((part) => part.type === "text");
    assert(textPart?.text === "mock:Nova MCP smoke test", "Unexpected MCP execute output");
    assert(result.structuredContent?.echoed === "Nova MCP smoke test", "Structured content mismatch");

    console.log("MCP smoke test passed.");
    console.log(`Listed tool: ${echoDefinition.name}`);
    console.log(`Runtime tool name: ${prefixedToolName}`);
    console.log(`Output: ${textPart.text}`);
  } finally {
    await client.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
