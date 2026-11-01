import { describe, expect, it } from "vitest";

import {
  createInterviewBudgetLevelChange,
  recordInterviewBudgetLevelChange,
  withInterviewBudgetLevelChanges,
} from "./interview-budget-level-changes";

import type { InterviewBudgetLevel } from "../../../../../shared/interview-budget";
import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";

const message = (
  id: string,
  role: PetrinautAiMessage["role"],
): PetrinautAiMessage => ({
  id,
  role,
  parts: [{ type: "text", text: id }],
});

describe("interview budget level changes", () => {
  it("needs a message to follow", () => {
    expect(
      createInterviewBudgetLevelChange("conversation", [], {
        from: "standard",
        to: "quick",
      }),
    ).toBeUndefined();
  });

  it("places a note after the message it followed, only in its conversation", () => {
    const messages = [message("u1", "user"), message("a1", "assistant")];
    const change = createInterviewBudgetLevelChange("conversation", messages, {
      from: "standard",
      to: "thorough",
    });
    if (!change) throw new Error("Missing level change");
    expect(change.message.role).toBe("system");
    expect(
      withInterviewBudgetLevelChanges(
        [...messages, message("u2", "user")],
        [change],
        "conversation",
      ).map(({ id }) => id),
    ).toEqual(["u1", "a1", change.message.id, "u2"]);
    expect(
      withInterviewBudgetLevelChanges(messages, [change], "other"),
    ).toEqual(messages);
  });

  it("follows a re-identified message by its position among its role", () => {
    const change = createInterviewBudgetLevelChange(
      "conversation",
      [message("u1", "user"), message("optimistic", "user")],
      { from: "standard", to: "quick" },
    );
    if (!change) throw new Error("Missing level change");
    expect(
      withInterviewBudgetLevelChanges(
        [
          message("u1", "user"),
          message("a1", "assistant"),
          message("canonical", "user"),
        ],
        [change],
        "conversation",
      ).map(({ id }) => id),
    ).toEqual(["u1", "a1", "canonical", change.message.id]);
  });

  it("keeps one note per message for the final level, and none for a round trip", () => {
    const record = (
      changes: ReturnType<typeof recordInterviewBudgetLevelChange>,
      messages: readonly PetrinautAiMessage[],
      from: InterviewBudgetLevel,
      to: InterviewBudgetLevel,
      conversationId = "conversation",
    ) => {
      const change = createInterviewBudgetLevelChange(
        conversationId,
        messages,
        {
          from,
          to,
        },
      );
      if (!change) throw new Error("Missing level change");
      return recordInterviewBudgetLevelChange(changes, change);
    };
    const first = [message("u1", "user"), message("a1", "assistant")];
    // A drag from Standard to Deep crosses Thorough.
    let changes = record([], first, "standard", "thorough");
    changes = record(changes, first, "thorough", "deep");
    expect(changes.map(({ from, level }) => [from, level])).toEqual([
      ["standard", "deep"],
    ]);
    // Dragging back to where the note started removes it.
    changes = record(changes, first, "deep", "standard");
    expect(changes).toEqual([]);
    // A change in another conversation, or after a new message, is its own note.
    changes = record(changes, first, "standard", "quick");
    changes = record(changes, first, "standard", "deep", "other");
    const later = [...first, message("u2", "user")];
    changes = record(changes, later, "quick", "thorough");
    expect(
      changes.map(({ conversationId, from, level }) => [
        conversationId,
        from,
        level,
      ]),
    ).toEqual([
      ["conversation", "standard", "quick"],
      ["other", "standard", "deep"],
      ["conversation", "quick", "thorough"],
    ]);
  });
});
