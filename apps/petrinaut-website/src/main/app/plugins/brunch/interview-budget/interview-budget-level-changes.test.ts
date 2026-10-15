import { describe, expect, it } from "vitest";

import {
  createInterviewBudgetLevelChange,
  withInterviewBudgetLevelChanges,
} from "./interview-budget-level-changes";

import type { PetrinautAiMessage } from "@hashintel/petrinaut/ui";

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
      createInterviewBudgetLevelChange("conversation", [], "quick"),
    ).toBeUndefined();
  });

  it("places a note after the message it followed, only in its conversation", () => {
    const messages = [message("u1", "user"), message("a1", "assistant")];
    const change = createInterviewBudgetLevelChange(
      "conversation",
      messages,
      "thorough",
    );
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
      "quick",
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
});
