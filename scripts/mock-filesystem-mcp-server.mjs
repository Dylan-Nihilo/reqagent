import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { promises as fs } from "node:fs";

const PROTOCOL_VERSION = "2025-11-25";
const rootDir = path.resolve(process.argv[2] ?? process.cwd());

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function respond(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function respondError(id, code, message) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
    },
  });
}

function isInsideRoot(candidatePath) {
  const resolvedCandidate = path.resolve(candidatePath);
  const prefix = `${rootDir}${path.sep}`;
  return resolvedCandidate === rootDir || resolvedCandidate.startsWith(prefix);
}

function resolveTargetPath(inputPath) {
  const candidate = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(rootDir, inputPath);
  return isInsideRoot(candidate) ? candidate : null;
}

async function buildDirectoryTree(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const children = await Promise.all(entries.map(async (entry) => {
    const absPath = path.join(dir, entry.name);
    const relPath = path.relative(rootDir, absPath) || ".";

    if (entry.isDirectory()) {
      return {
        name: entry.name,
        path: relPath,
        type: "directory",
        children: await buildDirectoryTree(absPath),
      };
    }

    return {
      name: entry.name,
      path: relPath,
      type: "file",
    };
  }));

  return children;
}

async function handleToolCall(message) {
  const toolName = String(message.params?.name ?? "");

  if (toolName === "list_allowed_directories") {
    respond(message.id, {
      content: [
        {
          type: "text",
          text: rootDir,
        },
      ],
      structuredContent: {
        directories: [rootDir],
      },
      isError: false,
    });
    return;
  }

  if (toolName === "read_file") {
    const inputPath = String(message.params?.arguments?.path ?? "");
    const targetPath = resolveTargetPath(inputPath);

    if (!targetPath) {
      respond(message.id, {
        content: [
          {
            type: "text",
            text: `Access denied: ${inputPath}`,
          },
        ],
        structuredContent: {
          path: inputPath,
        },
        isError: true,
      });
      return;
    }

    const content = await fs.readFile(targetPath, "utf8");
    respond(message.id, {
      content: [
        {
          type: "text",
          text: content,
        },
      ],
      structuredContent: {
        path: targetPath,
        relativePath: path.relative(rootDir, targetPath),
        content,
      },
      isError: false,
    });
    return;
  }

  if (toolName === "directory_tree") {
    respond(message.id, {
      content: [
        {
          type: "text",
          text: JSON.stringify(await buildDirectoryTree(rootDir)),
        },
      ],
      structuredContent: {
        rootDir,
        children: await buildDirectoryTree(rootDir),
      },
      isError: false,
    });
    return;
  }

  respondError(message.id, -32601, `Tool not found: ${toolName}`);
}

function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return;
  }

  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {
        tools: {
          listChanged: false,
        },
      },
      serverInfo: {
        name: "reqagent-mock-filesystem-mcp",
        version: "1.0.0",
      },
    });
    return;
  }

  if (message.method === "notifications/initialized") {
    return;
  }

  if (message.method === "tools/list") {
    respond(message.id, {
      tools: [
        {
          name: "list_allowed_directories",
          title: "List Allowed Directories",
          description: "Return the directories this server is allowed to access.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "read_file",
          title: "Read File",
          description: "Read a file within the allowed workspace root.",
          inputSchema: {
            type: "object",
            properties: {
              path: {
                type: "string",
                description: "Absolute or relative path to the file",
              },
            },
            required: ["path"],
          },
        },
        {
          name: "directory_tree",
          title: "Directory Tree",
          description: "Return a recursive directory tree for the allowed workspace root.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    });
    return;
  }

  if (message.method === "tools/call") {
    handleToolCall(message).catch((error) => {
      const errorMessage = error instanceof Error ? error.message : "Tool execution failed";
      respond(message.id, {
        content: [
          {
            type: "text",
            text: errorMessage,
          },
        ],
        structuredContent: {},
        isError: true,
      });
    });
    return;
  }

  if (message.id !== undefined) {
    respondError(message.id, -32601, `Method not found: ${message.method}`);
  }
}

const reader = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

reader.on("line", (line) => {
  if (!line.trim()) return;

  try {
    handleMessage(JSON.parse(line));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    respondError("parse-error", -32700, message);
  }
});

reader.on("close", () => {
  process.exit(0);
});
