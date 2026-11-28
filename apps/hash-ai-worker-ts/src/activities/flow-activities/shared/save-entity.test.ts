import { describe, expect, it, vi } from "vitest";

import { ConversationClassificationError } from "@local/hash-graph-sdk/conversation-entity-restrictions";

import { retrySave } from "./save-entity.js";

describe("retrySave", () => {
  it("aborts immediately on ConversationClassificationError without retrying", async () => {
    const save = vi.fn(() =>
      Promise.reject(new ConversationClassificationError("Agent Conversation")),
    );

    await expect(retrySave(save)).rejects.toThrow(
      ConversationClassificationError,
    );
    expect(save).toHaveBeenCalledTimes(1);
  });
});
