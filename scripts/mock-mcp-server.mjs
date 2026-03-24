import process from "node:process";
import readline from "node:readline";

const PROTOCOL_VERSION = "2025-11-25";

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
        name: "reqagent-mock-mcp",
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
          name: "echo",
          title: "Mock Echo",
          description: "Echoes the provided text for MCP smoke testing.",
          inputSchema: {
            type: "object",
            properties: {
              text: {
                type: "string",
                description: "Text to echo back",
              },
            },
            required: ["text"],
          },
        },
      ],
    });
    return;
  }

  if (message.method === "tools/call") {
    const text = String(message.params?.arguments?.text ?? "");
    respond(message.id, {
      content: [
        {
          type: "text",
          text: `mock:${text}`,
        },
      ],
      structuredContent: {
        echoed: text,
      },
      isError: false,
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
