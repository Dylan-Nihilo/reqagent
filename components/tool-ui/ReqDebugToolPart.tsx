"use client";

import type { ToolCallMessagePartProps } from "@assistant-ui/react";

// Debug renderer — dumps all tool call props as JSON.
// Replace ReqToolPart in toolkit.tsx with this to observe real agent state.
export function ReqDebugToolPart(props: ToolCallMessagePartProps) {
  return (
    <div style={{
      fontFamily: "monospace",
      fontSize: 11,
      background: "#0a0a0a",
      border: "1px solid #333",
      borderRadius: 6,
      margin: "4px 0",
      overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 10px",
        background: "#111",
        borderBottom: "1px solid #222",
      }}>
        <span style={{ color: "#666", fontSize: 10 }}>TOOL</span>
        <span style={{ color: "#e0e0e0", fontWeight: 600 }}>{props.toolName}</span>
        <span style={{
          marginLeft: "auto",
          color: statusColor(props.status?.type),
          fontSize: 10,
        }}>
          {props.status?.type ?? "unknown"}
          {props.status?.type === "incomplete" && props.status.reason
            ? ` (${props.status.reason})`
            : ""}
        </span>
      </div>

      {/* Args */}
      {props.argsText && (
        <section>
          <div style={sectionLabelStyle}>args</div>
          <pre style={preStyle}>{formatJson(props.argsText)}</pre>
        </section>
      )}

      {/* Result */}
      {props.result !== undefined && (
        <section>
          <div style={sectionLabelStyle}>result</div>
          <pre style={preStyle}>{JSON.stringify(props.result, null, 2)}</pre>
        </section>
      )}

      {/* Interrupt (approval request) */}
      {props.interrupt && (
        <section>
          <div style={{ ...sectionLabelStyle, color: "#e8a000" }}>interrupt (approval)</div>
          <pre style={preStyle}>{JSON.stringify(props.interrupt, null, 2)}</pre>
        </section>
      )}
    </div>
  );
}

function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function statusColor(type: string | undefined): string {
  switch (type) {
    case "running": return "#4ade80";
    case "complete": return "#60a5fa";
    case "incomplete": return "#f87171";
    case "requires-action": return "#e8a000";
    default: return "#888";
  }
}

const sectionLabelStyle: React.CSSProperties = {
  padding: "3px 10px",
  color: "#555",
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 1,
  borderTop: "1px solid #1a1a1a",
};

const preStyle: React.CSSProperties = {
  margin: 0,
  padding: "4px 10px 8px",
  color: "#b0b0b0",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  fontSize: 11,
  lineHeight: 1.5,
  maxHeight: 240,
  overflowY: "auto",
};
