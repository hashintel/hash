/**
 * Proof obligation 13: `POST /chat`'s admission table, byte for byte, over
 * the envelopes the panel sends today and those it may have sent malformed;
 * and Ledger comments as the model reads Brunch on Flue's comment signal.
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
const versionLoad = {
  id: "version-1",
  decisionTime: "2026-11-12T09:30:00.000Z",
};

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

  test("v2 with a version load: the load is read for the note; the entry keeps the context", () => {
    const withLoad = { ...submissionContext, versionLoad };
    const body = petrinautContextualUserMessageBody({
      userText,
      diagnosticsContext: "",
      submissionContext: withLoad,
    });
    expect(brunchUserInput(body)).toEqual({
      content: userText,
      entry: {
        kind: "brunch.user",
        data: { body: "contextual", userText, submissionContext: withLoad },
      },
      versionLoad,
    });
  });

  test("a v2 version load without a valid decision time is none", () => {
    const body = petrinautContextualUserMessageBody({
      userText,
      diagnosticsContext: "",
      submissionContext: {
        ...submissionContext,
        versionLoad: { id: "version-1", decisionTime: "yesterday" },
      },
    });
    expect(brunchUserInput(body)).not.toHaveProperty("versionLoad");
  });
});

describe("Ledger comments", () => {
  const comment = {
    id: "n1",
    records: ["e1"],
    quote: 'the "clerks" <place> & desk',
    text: "People, not a place.",
  };

  test("one comment: the model reads Flue's comment signal, byte for byte; data keeps the comments", () => {
    expect(brunchUserInput(JSON.stringify({ comments: [comment] }))).toEqual({
      content: [
        '<brunch.ledger-comments type="brunch.ledger-comments">',
        '{"comments":[{"id":"n1","records":["e1"],"quote":"the \\"clerks\\" &lt;place&gt; &amp; desk","text":"People, not a place."}]}',
        "</brunch.ledger-comments>",
      ].join("\n"),
      entry: { kind: "brunch.ledger-comments", data: { comments: [comment] } },
    });
  });

  test("comments are read as the panel parses them, not as sent", () => {
    // Keys in another order and spacing: Brunch's signal carries the parsed comments.
    const sent = `{ "comments": [ { "text": "${comment.text}", "records": ["e1"], "id": "n1" } ] }`;
    expect(brunchUserInput(sent).content).toBe(
      [
        '<brunch.ledger-comments type="brunch.ledger-comments">',
        '{"comments":[{"id":"n1","records":["e1"],"text":"People, not a place."}]}',
        "</brunch.ledger-comments>",
      ].join("\n"),
    );
  });

  test.each([
    ["no comments", JSON.stringify({ comments: [] })],
    ["an extra key", JSON.stringify({ comments: [comment], extra: 1 })],
    [
      "a malformed comment ID",
      JSON.stringify({ comments: [{ ...comment, id: "c1" }] }),
    ],
  ])("a body that is not comments (%s) is the user's text", (_, body) => {
    expect(brunchUserInput(body)).toEqual({
      content: body,
      entry: {
        kind: "brunch.user",
        data: { body: "ordinary", userText: body },
      },
    });
  });
});
