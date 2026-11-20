import { expect, test } from "vitest";

import { ledgerCommentsMessage } from "@hashintel/brunch-agent";

import { showLedgerComments } from "./brunch-ledger-comment-messages";

import type { PetrinautAiMessage } from "../chat/ai-assistant-panel";

const { body } = ledgerCommentsMessage([
  {
    id: "n1",
    records: ["e1"],
    quote: "Night   crew\nloads trucks",
    text: "There are two crews.",
  },
  { id: "n2", records: ["c1"], text: "Only in winter." },
]);

test("shows a turn marked as Ledger comments as the comments, and leaves other messages alone", () => {
  const messages: PetrinautAiMessage[] = [
    {
      id: "comments",
      role: "user",
      metadata: { ledgerComments: true },
      parts: [{ type: "text", text: body }],
    },
    { id: "plain", role: "user", parts: [{ type: "text", text: "{}" }] },
    { id: "typed", role: "user", parts: [{ type: "text", text: body }] },
  ];
  const [comments, plain, typed] = showLedgerComments(messages);
  expect(comments?.parts).toEqual([
    {
      type: "text",
      text: "Comments on the Ledger\n“Night crew loads trucks” — There are two crews.\nOnly in winter.",
    },
  ]);
  expect(plain).toBe(messages[1]);
  expect(typed).toBe(messages[2]);
});
