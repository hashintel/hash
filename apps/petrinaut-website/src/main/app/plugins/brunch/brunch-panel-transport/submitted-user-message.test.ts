import { describe, expect, test } from "vitest";

import { petrinautContextualUserMessageBody } from "@hashintel/brunch-agent";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";

import { brunchSubmittedUserMessage } from "./submitted-user-message";

import type { UIMessage } from "ai";

const message = (
  id: string,
  value: string,
  role: UIMessage["role"] = "user",
): UIMessage => ({
  id,
  role,
  parts: [{ type: "text", text: value }],
});

describe("brunchSubmittedUserMessage", () => {
  test("admits an ordinary turn unchanged", () => {
    expect(brunchSubmittedUserMessage([message("user-1", "Hello.")])).toEqual({
      messageId: "user-1",
      body: "Hello.",
    });
  });

  test("leaves Petrinaut's diagnostics context out of the human's turn", () => {
    expect(
      brunchSubmittedUserMessage([
        message("user-1", "Repair the model."),
        message(petrinautDiagnosticsContextMessageId, "One current error."),
      ]),
    ).toEqual({ messageId: "user-1", body: "Repair the model." });
  });

  test("carries submission context without any diagnostics", () => {
    const submissionContext = { hostKey: { level: 2 } };
    const expected = {
      messageId: "user-1",
      body: petrinautContextualUserMessageBody({
        userText: "Repair the model.",
        diagnosticsContext: "",
        submissionContext,
      }),
    };
    expect(
      brunchSubmittedUserMessage([message("user-1", "Repair the model.")], {
        ...submissionContext,
      }),
    ).toEqual(expected);
    expect(
      brunchSubmittedUserMessage(
        [
          message("user-1", "Repair the model."),
          message(petrinautDiagnosticsContextMessageId, "One current error."),
        ],
        submissionContext,
      ),
    ).toEqual(expected);
  });

  test("refuses a continuation that carries only diagnostics context", () => {
    expect(() =>
      brunchSubmittedUserMessage([
        message("user-1", "Repair the model."),
        message("assistant-1", "Changed the kernel.", "assistant"),
        message(petrinautDiagnosticsContextMessageId, "One current error."),
      ]),
    ).toThrow("The submitted user message has no text.");
  });
});
