import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  type Conversation,
  type EntryRecord,
  MemoryStorage,
  type Storage,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, test } from "vitest";

import { brunchTools } from "@hashintel/brunch-agent";

import {
  fauxAssistantMessage,
  fauxToolCall,
  scriptedModel,
} from "../test/scripted-model";
import { openHarness } from "./harness";

const context = BACKGROUND_CONTEXT;

const entries = [
  [
    "entity/create",
    { name: "Dryer", kind: "resource", origin: "stated", status: "confirmed" },
  ],
  [
    "claim/create",
    {
      text: "There is one dryer, held by each batch while drying.",
      entities: ["$0"],
      origin: "stated",
      status: "confirmed",
    },
  ],
];

const answer = "Recorded the dryer and its capacity.";

/** One input whose model commits to the Ledger, then answers. */
const runOneTurn = async (storage: Storage) => {
  const { models, model, state } = scriptedModel([
    fauxAssistantMessage(
      fauxToolCall(brunchTools.ledgerCommit, { entries }, { id: "call-1" }),
      { stopReason: "toolUse" },
    ),
    fauxAssistantMessage(answer),
  ]);
  const harness = await openHarness(storage, { models }, context);
  const root = await harness.root(context, { agent: { model } });
  const submission = await root.submit(
    { type: "input", content: "We have one dryer." },
    context,
  );
  const settled = await submission.wait(context);
  return { harness, root, settled, requests: state.callCount };
};

const transcript = async (conversation: Conversation) =>
  (await conversation.entries({ order: "ascending" }, 100, undefined, context))
    .items;

const textOf = (entry: EntryRecord | undefined) => entry?.model?.[0]?.content;

/** The model's view of one answered turn; `pi.system` entries mark prompt changes and are left out. */
const expectOneCommitTurn = (recorded: readonly EntryRecord[]) => {
  const turn = recorded.filter(({ kind }) => kind !== "pi.system");
  expect(turn.map(({ kind }) => kind)).toEqual([
    "pi.user",
    "pi.assistant",
    "pi.tool-result",
    "pi.assistant",
  ]);
  const [, call, result, reply] = turn;
  expect(call?.model?.[0]).toMatchObject({
    role: "assistant",
    content: [
      {
        type: "toolCall",
        id: "call-1",
        name: brunchTools.ledgerCommit,
        arguments: { entries },
      },
    ],
  });
  const resultMessage = result?.model?.[0];
  expect(resultMessage).toMatchObject({
    role: "toolResult",
    toolCallId: "call-1",
    toolName: brunchTools.ledgerCommit,
    isError: false,
  });
  const resultContent = textOf(result);
  const resultText =
    Array.isArray(resultContent) && resultContent[0]?.type === "text"
      ? resultContent[0].text
      : undefined;
  // Brunch's receipt for a first commit: queue-aligned IDs, following the one USER message.
  expect(JSON.parse(resultText ?? "null")).toEqual({
    status: "recorded",
    commitId: "call-1",
    revision: 1,
    ids: ["e1", "c1"],
    exchanges: 1,
    openQuestions: 0,
  });
  expect(reply?.model?.[0]).toMatchObject({
    role: "assistant",
    content: [{ type: "text", text: answer }],
  });
  return reply;
};

describe("one turn on Pi Durable", () => {
  test("in memory: ledger_commit result is committed and the run answers", async () => {
    const { harness, root, settled, requests } = await runOneTurn(
      new MemoryStorage(),
    );
    try {
      expect(settled.status).toBe("done");
      expect(requests).toBe(2);
      const reply = expectOneCommitTurn(await transcript(root));
      expect(settled.answer).toBe(reply?.id);
    } finally {
      await harness.close(context);
    }
  });

  describe("on SQLite", () => {
    let directory: string | undefined;
    afterEach(async () => {
      if (directory !== undefined)
        await rm(directory, { recursive: true, force: true });
    });

    test("the committed turn survives close and reopen", async () => {
      directory = await mkdtemp(join(tmpdir(), "durable-agents-"));
      const file = join(directory, "session.sqlite");

      const { harness, root, settled } = await runOneTurn(
        await openNodeSqliteStorage(file),
      );
      expect(settled.status).toBe("done");
      const before = await transcript(root);
      expectOneCommitTurn(before);
      await harness.close(context);

      const { models } = scriptedModel([]);
      const reopened = await openHarness(
        await openNodeSqliteStorage(file),
        { models },
        context,
      );
      try {
        const after = await transcript(await reopened.root(context));
        expectOneCommitTurn(after);
        expect(after).toEqual(before);
      } finally {
        await reopened.close(context);
      }
    });
  });
});
