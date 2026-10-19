import * as v from "valibot";
import { expect, test } from "vitest";

import { vLedgerAppend } from "./append";
import { ledgerCommentsMessage } from "./comments";
import {
  foldCommits,
  prepareAppend,
  type LedgerHistoryMessage,
} from "./commits";
import { projectLedger } from "./projection/project-ledger";
import { renderLedgerMarkdown } from "./projection/render-ledger-markdown";

/** A delivered signal as Flue's history projects it. */
const projected = (
  id: string,
  message: ReturnType<typeof ledgerCommentsMessage>,
): LedgerHistoryMessage => ({
  id,
  role: "system",
  purpose: "dispatch",
  ...(message.tagName === undefined
    ? {}
    : { signal: { tagName: message.tagName } }),
  parts: [{ type: "text", text: message.body, state: "done" }],
});

const commit = (toolCallId: string, entries: unknown[], ids: string[]) => ({
  id: `assistant-${toolCallId}`,
  role: "assistant" as const,
  parts: [
    {
      type: "dynamic-tool",
      toolName: "ledger_commit",
      toolCallId,
      state: "output-available",
      input: { entries },
      output: { status: "recorded", commitId: toolCallId, revision: 1, ids },
    },
  ],
});

const crew = {
  name: "Night crew",
  kind: "location",
  origin: "stated",
  status: "confirmed",
};

test("a comment signal is held in the Ledger and anchors the commits that follow it", () => {
  const { state, commits } = foldCommits({
    messages: [
      {
        id: "user-1",
        role: "user",
        purpose: "user",
        parts: [{ type: "text", text: "A night crew loads the trucks." }],
      },
      commit("commit-1", [["entity/create", crew]], ["e1"]),
      projected(
        "signal-1",
        ledgerCommentsMessage([
          {
            id: "n1",
            records: ["e1"],
            quote: "Night crew",
            text: "The night crew is people,   not a place.",
          },
        ]),
      ),
      commit(
        "commit-2",
        [["entity/update/e1", { ...crew, kind: "resource" }]],
        ["e1"],
      ),
    ],
  });
  expect(state.comments).toEqual([
    {
      id: "n1",
      records: ["e1"],
      quote: "Night crew",
      text: "The night crew is people,   not a place.",
      turn: "signal-1",
    },
  ]);
  expect(commits.map(({ afterMessageId }) => afterMessageId)).toEqual([
    "user-1",
    "signal-1",
  ]);
  expect(state.turns).toEqual([
    { id: "user-1", excerpt: "A night crew loads the trucks." },
    { id: "signal-1", excerpt: "The night crew is people, not a place." },
  ]);
});

/** The receipt `ledger_commit` returns for these entries, called after `messages`. */
const receiptFor = (
  messages: readonly LedgerHistoryMessage[],
  submitted: unknown[],
) => {
  const { entries } = v.parse(vLedgerAppend, { entries: submitted });
  return prepareAppend({
    history: {
      messages: [
        ...messages,
        {
          id: "assistant-pending",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "ledger_commit",
              toolCallId: "pending",
              state: "input-available",
              input: { entries },
            },
          ],
        },
      ],
    },
    toolCallId: "pending",
    entries,
  });
};

const commented: LedgerHistoryMessage[] = [
  { id: "user-1", role: "user", purpose: "user", parts: [] },
  commit("commit-1", [["entity/create", crew]], ["e1"]),
  projected(
    "signal-1",
    ledgerCommentsMessage([
      { id: "n1", records: ["e1"], text: "People, not a place." },
      { id: "n2", records: ["e1"], text: "There are two crews." },
    ]),
  ),
];

const resolvingUpdate = [
  "entity/update/e1",
  { ...crew, kind: "resource", resolves: ["n1"] },
];

test("a comment turn counts as an exchange on the receipt", () => {
  expect(receiptFor(commented, [["entity/update/e1", crew]])).toMatchObject({
    status: "recorded",
    exchanges: 2,
  });
});

test("a record resolves the comment it addresses, and the receipt lists those still open", () => {
  expect(receiptFor(commented, [resolvingUpdate])).toMatchObject({
    status: "recorded",
    openComments: [{ id: "n2", text: "There are two crews." }],
  });
  const { state } = foldCommits({
    messages: [...commented, commit("commit-2", [resolvingUpdate], ["e1"])],
  });
  expect(
    state.comments.map(({ id, resolvedBy }) => ({ id, resolvedBy })),
  ).toEqual([
    { id: "n1", resolvedBy: "e1" },
    { id: "n2", resolvedBy: undefined },
  ]);
});

test("a record cannot resolve a comment the user never sent", () => {
  expect(
    receiptFor(commented, [
      ["entity/update/e1", { ...crew, resolves: ["n9"] }],
    ]),
  ).toMatchObject({
    status: "refused",
    code: "unknown-address",
    message: "Unknown comment n9.",
  });
});

test("the model's map lists the comments still open with the records they are on", () => {
  const { state } = foldCommits({
    messages: [...commented, commit("commit-2", [resolvingUpdate], ["e1"])],
  });
  expect(renderLedgerMarkdown(projectLedger(state))).toContain(
    "## Open comments\n\n- There are two crews. \u2014 on `e1` `n2`",
  );
});
