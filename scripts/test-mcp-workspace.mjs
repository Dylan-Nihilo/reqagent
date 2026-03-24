import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promises as fs } from "node:fs";
import { createMCPClient } from "@ai-sdk/mcp";
import { Experimental_StdioMCPTransport } from "@ai-sdk/mcp/mcp-stdio";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const workspaceDir = await fs.mkdtemp(path.join(os.tmpdir(), "reqagent-workspace-mcp-"));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "reqagent-outside-"));
  const docsDir = path.join(workspaceDir, "docs");
  const insideFile = path.join(docsDir, "requirements.md");
  const outsideFile = path.join(outsideDir, "secret.txt");

  await fs.mkdir(docsDir, { recursive: true });
  await fs.writeFile(insideFile, "# Workspace Document\ninside only\n", "utf8");
  await fs.writeFile(outsideFile, "outside secret\n", "utf8");

  const client = await createMCPClient({
    transport: new Experimental_StdioMCPTransport({
      command: process.execPath,
      args: ["scripts/mock-filesystem-mcp-server.mjs", workspaceDir],
    }),
  });

  try {
    const definitions = await client.listTools();
    const toolNames = definitions.tools.map((tool) => tool.name);
    assert(toolNames.includes("list_allowed_directories"), "Missing list_allowed_directories tool");
    assert(toolNames.includes("read_file"), "Missing read_file tool");
    assert(toolNames.includes("directory_tree"), "Missing directory_tree tool");

    const proxiedTools = client.toolsFromDefinitions(definitions);

    const allowedDirectoriesResult = await proxiedTools.list_allowed_directories.execute({}, {
      toolCallId: "workspace-call-1",
      messages: [],
      abortSignal: undefined,
    });
    assert(
      allowedDirectoriesResult.structuredContent?.directories?.[0] === workspaceDir,
      "Allowed directories did not point at the workspace root",
    );

    const readInsideResult = await proxiedTools.read_file.execute({ path: insideFile }, {
      toolCallId: "workspace-call-2",
      messages: [],
      abortSignal: undefined,
    });
    const insideText = readInsideResult.content?.find((part) => part.type === "text")?.text;
    assert(insideText?.includes("inside only"), "Expected read_file to read workspace content");

    const treeResult = await proxiedTools.directory_tree.execute({}, {
      toolCallId: "workspace-call-3",
      messages: [],
      abortSignal: undefined,
    });
    const children = treeResult.structuredContent?.children ?? [];
    const docsEntry = children.find((entry) => entry.name === "docs");
    assert(docsEntry, "directory_tree missing docs directory");

    const deniedResult = await proxiedTools.read_file.execute({ path: outsideFile }, {
      toolCallId: "workspace-call-4",
      messages: [],
      abortSignal: undefined,
    });
    assert(deniedResult.isError === true, "Expected outside workspace read to be denied");
    const deniedText = deniedResult.content?.find((part) => part.type === "text")?.text;
    assert(deniedText?.includes("Access denied"), "Denied read did not return access error");

    console.log("Workspace MCP binding test passed.");
    console.log(`Workspace root: ${workspaceDir}`);
    console.log(`Allowed dir tool: ${allowedDirectoriesResult.structuredContent.directories[0]}`);
    console.log(`Read file: ${insideFile}`);
    console.log(`Denied file: ${outsideFile}`);
  } finally {
    await client.close();
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.rm(outsideDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
