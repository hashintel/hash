import * as v from "valibot";
import { expect, test } from "vitest";

import { vLedgerAppend } from "./append";
import { ledgerCommentsMessage } from "./comments";
import {
  foldCommits,
  prepareAppend,
  type LedgerHistoryMessage,
} from "./commits";

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

test("a comment turn counts as an exchange on the receipt", () => {
  const { entries } = v.parse(vLedgerAppend, {
    entries: [["entity/update/e1", { ...crew, kind: "resource" }]],
  });
  const receipt = prepareAppend({
    history: {
      messages: [
        { id: "user-1", role: "user", purpose: "user", parts: [] },
        commit("commit-1", [["entity/create", crew]], ["e1"]),
        projected(
          "signal-1",
          ledgerCommentsMessage([
            { id: "n1", records: ["e1"], text: "People, not a place." },
          ]),
        ),
        {
          id: "assistant-commit-2",
          role: "assistant",
          parts: [
            {
              type: "dynamic-tool",
              toolName: "ledger_commit",
              toolCallId: "commit-2",
              state: "input-available",
              input: { entries },
            },
          ],
        },
      ],
    },
    toolCallId: "commit-2",
    entries,
  });
  expect(receipt).toMatchObject({ status: "recorded", exchanges: 2 });
});
