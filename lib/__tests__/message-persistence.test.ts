import { describe, expect, it } from "vitest";
import {
  ensureThread,
  getThreadMessages,
  syncThreadUiMessages,
  upsertStoredMessageEntry,
} from "@/lib/db/store";

describe("message persistence guards", () => {
  it("ignores blank ids during syncThreadUiMessages", () => {
    const threadId = `test-thread-sync-${Date.now()}`;
    ensureThread({
      threadId,
      workspaceId: "ws_reqagent_default",
    });

    syncThreadUiMessages(threadId, [
      {
        id: "",
        role: "assistant",
        parts: [{ type: "text", text: "should be ignored" }],
      },
      {
        id: "msg-user-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    ]);

    const messages = getThreadMessages(threadId);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("msg-user-1");
  });

  it("ignores blank ids during upsertStoredMessageEntry", () => {
    const threadId = `test-thread-upsert-${Date.now()}`;
    ensureThread({
      threadId,
      workspaceId: "ws_reqagent_default",
    });

    upsertStoredMessageEntry(threadId, {
      id: "",
      parentId: null,
      format: "ai-sdk/v6",
      content: {
        role: "assistant",
        parts: [{ type: "text", text: "should be ignored" }],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const messages = getThreadMessages(threadId);
    expect(messages).toHaveLength(0);
  });
});
