/**
 * Proof obligation 13: `POST /chat`'s admission table, byte for byte, over
 * the envelopes the panel sends today and those it may have sent malformed.
 */
import { describe, expect, test } from "vitest";

import {
  petrinautContextualUserMessageBody,
  PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX,
} from "@hashintel/brunch-agent";

import { brunchUserInput } from "./user-input";

const userText = "Add a dryer.";
const diagnosticsContext = "Net check: 2 warnings.";
const submissionContext = {
  interviewBudget: { questions: 3 },
  words: ["RelayDesk"],
};
const v2Prefix = "petrinaut-contextual-user-message:v2\n";

describe("brunchUserInput", () => {
  test("ordinary text: the model reads it; data keeps it", () => {
    expect(brunchUserInput(userText)).toEqual({
      content: userText,
      entry: { kind: "brunch.user", data: { body: "ordinary", userText } },
    });
  });

  test("v2 without diagnostics: the model reads the user's text only", () => {
    const body = petrinautContextualUserMessageBody({
      userText,
      diagnosticsContext: "",
      submissionContext,
    });
    expect(brunchUserInput(body)).toEqual({
      content: userText,
      entry: {
        kind: "brunch.user",
        data: { body: "contextual", userText, submissionContext },
      },
    });
  });

  test("v2 with diagnostics: the model reads the v1 envelope of text and diagnostics", () => {
    const body = petrinautContextualUserMessageBody({
      userText,
      diagnosticsContext,
      submissionContext,
    });
    const { content, entry } = brunchUserInput(body);
    expect(content).toBe(
      `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}{"userText":"Add a dryer.","diagnosticsContext":"Net check: 2 warnings."}`,
    );
    expect(entry).toEqual({
      kind: "brunch.user",
      data: {
        body: "contextual",
        userText,
        diagnosticsContext,
        submissionContext,
      },
    });
  });

  test("v1 diagnostics: the model reads the envelope as sent", () => {
    const body = petrinautContextualUserMessageBody({
      userText,
      diagnosticsContext,
    });
    expect(brunchUserInput(body)).toEqual({
      content: body,
      entry: {
        kind: "brunch.user",
        data: { body: "contextual", userText, diagnosticsContext },
      },
    });
  });

  test.each([
    ["not JSON", `${v2Prefix}{not json`],
    [
      "an extra key",
      `${v2Prefix}${JSON.stringify({ userText, diagnosticsContext: "", submissionContext, extra: 1 })}`,
    ],
    [
      "an empty submission context",
      `${v2Prefix}${JSON.stringify({ userText, diagnosticsContext: "", submissionContext: {} })}`,
    ],
    [
      "empty user text",
      `${v2Prefix}${JSON.stringify({ userText: "", diagnosticsContext: "", submissionContext })}`,
    ],
    [
      "v1 without diagnostics",
      `${PETRINAUT_CONTEXTUAL_USER_MESSAGE_PREFIX}${JSON.stringify({ userText, diagnosticsContext: "" })}`,
    ],
  ])(
    "a malformed envelope (%s) is admitted as sent, not refused",
    (_, body) => {
      expect(brunchUserInput(body)).toEqual({
        content: body,
        entry: { kind: "brunch.user", data: { body: "invalid-contextual" } },
      });
    },
  );
});
