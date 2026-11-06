/**
 * The Brunch Ledger as a Pi Durable document. It stores the Ledger's own
 * history, the USER turns and accepted `ledger_commit` calls in transcript
 * order, which `@hashintel/brunch-agent` folds exactly as it folds a
 * transcript. The folded Ledger is not stored: the lib's only entry points,
 * `prepareAppend` and `foldCommits`, take a history, so storing their state
 * would make a second source of truth beside the commits they derive it from.
 */
import {
  type ConversationId,
  type Cursor,
  defineDoc,
  type EntryId,
  type EntryRecord,
  type JsonObject,
  type Tx,
} from "@earendil-works/pi-durable";
import * as v from "valibot";

import {
  brunchTools,
  foldCommits,
  type LedgerAppend,
  ledgerAppendOutputSchema,
  prepareAppend,
} from "@hashintel/brunch-agent";

/** `ledger_commit`'s result: recorded or refused. The lib exports the schema, not the type. */
export type LedgerAppendOutput = v.InferOutput<typeof ledgerAppendOutputSchema>;

/** A USER message the Ledger's turns anchor to, by its `pi.user` entry ID. */
type LedgerTurn = { id: string; role: "user"; parts: [] };

/** An accepted call, shaped as the settled tool part Brunch folds. */
type LedgerCall = {
  id: string;
  role: "assistant";
  parts: [
    {
      type: "dynamic-tool";
      toolName: string;
      toolCallId: string;
      state: "output-available";
      input: JsonObject;
      output: JsonObject;
    },
  ];
};

export type LedgerHistoryDoc = { messages: (LedgerTurn | LedgerCall)[] };

/** The empty history, whose fold is the lib's empty Ledger. */
const emptyHistory = (): LedgerHistoryDoc => ({ messages: [] });

/**
 * One per conversation, rewindable so `snapshotAsOf` reads it at any entry.
 * Forks take the value at the fork entry (`asOf`): `current` would copy the
 * parent's latest Ledger into a fork of an earlier point.
 */
export const LedgerDoc = defineDoc<LedgerHistoryDoc>({
  kind: "brunch.ledger",
  version: 1,
  scope: "conversation",
  history: "rewindable",
  fork: "asOf",
  initial: emptyHistory,
  checkpointWhen: () => false,
});

/** The Ledger a stored history folds to; a conversation with no commits yet has none stored. */
export const foldLedger = (doc: Readonly<LedgerHistoryDoc> | undefined) =>
  foldCommits(doc ?? emptyHistory());

/** Plain JSON for the document; the stored values are already JSON, their types only allow `undefined`. */
const toJson = (value: object) =>
  JSON.parse(JSON.stringify(value)) as JsonObject;

const issuesCall = (entry: EntryRecord, callId: string) =>
  entry.kind === "pi.assistant" &&
  (entry.model ?? []).some(
    (message) =>
      message.role === "assistant" &&
      message.content.some(
        (content) => content.type === "toolCall" && content.id === callId,
      ),
  );

/** The USER turns after `after`, through the last one before the call `callId`. */
const turnsBefore = async (
  tx: Tx,
  conversationId: ConversationId,
  callId: string,
  after: string | undefined,
): Promise<LedgerTurn[]> => {
  const query = {
    conversationId,
    order: "ascending" as const,
    ...(after === undefined ? {} : { minEntryId: Number(after) as EntryId }),
  };
  const turns: LedgerTurn[] = [];
  let cursor: Cursor | undefined;
  do {
    // eslint-disable-next-line no-await-in-loop -- Each page continues from the last one's cursor.
    const page = await tx.scanEntries(query, 100, cursor);
    for (const entry of page.items) {
      if (issuesCall(entry, callId)) return turns;
      if (entry.kind === "pi.user" && String(entry.id) !== after)
        turns.push({ id: String(entry.id), role: "user", parts: [] });
    }
    cursor = page.next;
  } while (cursor !== undefined);
  throw new Error(
    `Conversation ${conversationId} holds no ledger_commit call ${callId}.`,
  );
};

/**
 * Record call `callId` in the conversation's Ledger inside `tx`, or refuse it
 * and record nothing. A call already recorded, by an attempt a crash cut off
 * before its result committed, returns the receipt it was given.
 */
export const appendToLedger = async (
  tx: Tx,
  conversationId: ConversationId,
  callId: string,
  input: LedgerAppend,
): Promise<LedgerAppendOutput> => {
  const ledger = await tx.doc(LedgerDoc, conversationId);
  const recorded = ledger.messages.find(
    (message) =>
      message.role === "assistant" && message.parts[0].toolCallId === callId,
  );
  if (recorded?.role === "assistant")
    return v.parse(ledgerAppendOutputSchema, recorded.parts[0].output);

  const lastTurn = ledger.messages.findLast(({ role }) => role === "user");
  const turns = await turnsBefore(tx, conversationId, callId, lastTurn?.id);
  const part = {
    type: "dynamic-tool",
    toolName: brunchTools.ledgerCommit,
    toolCallId: callId,
    input: toJson(input),
  } as const;
  const pending = {
    id: callId,
    role: "assistant",
    parts: [{ ...part, state: "input-available" }],
  } as const;
  const result = prepareAppend({
    history: { messages: [...ledger.messages, ...turns, pending] },
    toolCallId: callId,
    entries: input.entries,
  });
  if (result.status === "recorded")
    ledger.messages.push(...turns, {
      id: callId,
      role: "assistant",
      parts: [{ ...part, state: "output-available", output: toJson(result) }],
    });
  return result;
};
