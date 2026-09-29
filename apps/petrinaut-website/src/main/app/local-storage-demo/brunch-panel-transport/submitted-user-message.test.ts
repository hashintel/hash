import { describe, expect, test } from "vitest";

import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent/contextual-user-message";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";

import { brunchSubmittedUserMessage } from "./submitted-user-message";

import type { UIMessage } from "ai";

const text = (id: string, value: string): UIMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text: value }],
});

describe("brunchSubmittedUserMessage", () => {
  test("admits an ordinary turn unchanged", () => {
    expect(brunchSubmittedUserMessage([text("user-1", "Hello.")])).toEqual({
      messageId: "user-1",
      body: "Hello.",
    });
  });

  test("carries reserved diagnostics on the correlated user turn", () => {
    const context = "Petrinaut diagnostics context only; one current error.";
    expect(
      brunchSubmittedUserMessage([
        text("user-with-context", "Repair the model."),
        text(petrinautDiagnosticsContextMessageId, context),
      ]),
    ).toEqual({
      messageId: "user-with-context",
      body: petrinautContextualUserMessageBody({
        userText: "Repair the model.",
        diagnosticsContext: context,
      }),
    });
  });

  test.each([
    [
      "duplicate",
      [
        text("user-1", "Repair."),
        text(petrinautDiagnosticsContextMessageId, "a"),
        text(petrinautDiagnosticsContextMessageId, "b"),
      ],
      "The submission has duplicate diagnostics context.",
    ],
    [
      "stale",
      [
        text(petrinautDiagnosticsContextMessageId, "a"),
        text("user-1", "Repair."),
      ],
      "The submission has invalid or stale diagnostics context.",
    ],
  ])("refuses %s diagnostics context", (_label, messages, error) => {
    expect(() => brunchSubmittedUserMessage(messages)).toThrow(error);
  });
});
