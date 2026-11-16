import { describe, expect, test } from "vitest";

import {
  ledgerCommentsMessage,
  petrinautContextualUserMessageBody,
  petrinautSubmissionContext,
} from "@hashintel/brunch-agent";
import { petrinautDiagnosticsContextMessageId } from "@hashintel/petrinaut-core";

import { brunchSubmittedUserMessage } from "./submitted-user-message";

import type { UIMessage } from "ai";

const versionLoad = {
  id: "load-1",
  decisionTime: "2026-10-27T10:00:00.000Z",
};

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
      message: { kind: "user", body: "Hello." },
    });
  });

  test("leaves Petrinaut's diagnostics context out of the human's turn", () => {
    expect(
      brunchSubmittedUserMessage([
        message("user-1", "Repair the model."),
        message(petrinautDiagnosticsContextMessageId, "One current error."),
      ]),
    ).toEqual({
      messageId: "user-1",
      message: { kind: "user", body: "Repair the model." },
    });
  });

  test("carries submission context without any diagnostics", () => {
    const context = { words: ["Petrinaut"], versionLoad };
    const expected = {
      messageId: "user-1",
      message: {
        kind: "user",
        body: petrinautContextualUserMessageBody({
          userText: "Repair the model.",
          diagnosticsContext: "",
          submissionContext: petrinautSubmissionContext(context),
        }),
      },
    };
    expect(
      brunchSubmittedUserMessage(
        [message("user-1", "Repair the model.")],
        context,
      ),
    ).toEqual(expected);
    expect(
      brunchSubmittedUserMessage(
        [
          message("user-1", "Repair the model."),
          message(petrinautDiagnosticsContextMessageId, "One current error."),
        ],
        context,
      ),
    ).toEqual(expected);
  });

  test("delivers a turn marked as Ledger comments as the comment signal, with the host's version load", () => {
    const comments = [
      { id: "n1", records: ["e1"], text: "There are two crews." },
    ];
    const signal = ledgerCommentsMessage(comments);
    const marked = (id: string) => ({
      ...message(id, signal.body),
      metadata: { ledgerComments: true },
    });
    expect(brunchSubmittedUserMessage([marked("comments-1")])).toEqual({
      messageId: "comments-1",
      message: signal,
    });
    expect(
      brunchSubmittedUserMessage([marked("comments-2")], {
        words: ["Petrinaut"],
        versionLoad,
      }),
    ).toEqual({
      messageId: "comments-2",
      message: ledgerCommentsMessage(comments, { versionLoad }),
    });
  });

  test("a typed turn whose text happens to parse as comments stays the user's words", () => {
    const { body } = ledgerCommentsMessage([
      { id: "n1", records: ["e1"], text: "There are two crews." },
    ]);
    expect(brunchSubmittedUserMessage([message("user-1", body)])).toEqual({
      messageId: "user-1",
      message: { kind: "user", body },
    });
  });

  test("refuses a turn marked as Ledger comments that holds none", () => {
    expect(() =>
      brunchSubmittedUserMessage([
        {
          ...message("comments-1", "Not comments."),
          metadata: { ledgerComments: true },
        },
      ]),
    ).toThrow("The Ledger comments turn holds no comments.");
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
