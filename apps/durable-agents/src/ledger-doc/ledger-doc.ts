/**
 * The Brunch Ledger as a Pi Durable document. It stores the Ledger's own
 * history, the turns the USER opened (messages and Ledger comments) and
 * accepted `ledger_commit` calls in transcript order, which
 * `@hashintel/brunch-agent` folds exactly as it folds a
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
  brunchSignals,
  brunchTools,
  foldCommits,
  type LedgerAppend,
  type LedgerHistory,
  parseLedgerComments,
  prepareAppend,
  vLedgerAppendOutput,
} from "@hashintel/brunch-agent";

/** `ledger_commit`'s result: recorded or refused. The lib exports the schema, not the type. */
export type LedgerAppendOutput = v.InferOutput<typeof vLedgerAppendOutput>;

/**
 * The input entry kinds that open a USER turn: `brunch.user`, as `POST /chat`
 * admits a message, and `pi.user`, as conversations admitted before it hold.
 * Host notes and edits (`brunch.hand-edit`, `brunch.prune`) open none.
 */
const userTurnKinds: ReadonlySet<string> = new Set(["brunch.user", "pi.user"]);

/** A USER message the Ledger's turns anchor to, by its user input entry ID. */
type LedgerUserTurn = { id: string; role: "user"; parts: [] };

/**
 * The USER's Ledger comments, by their `brunch.ledger-comments` entry ID,
 * shaped as the comment signal Brunch folds: it opens a turn and holds the
 * comments in the Ledger.
 */
type LedgerCommentsTurn = {
  id: string;
  role: "system";
  signal: { tagName: typeof brunchSignals.ledgerComments };
  parts: [{ type: "text"; text: string }];
};

/** A turn the USER opened: a message or Ledger comments. */
type LedgerTurn = LedgerUserTurn | LedgerCommentsTurn;

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

/**
 * The turn an input entry opens, if any. A comment entry opens one only when
 * its comments parse, as Brunch's fold opens a turn on a comment signal.
 */
const turnOf = (entry: EntryRecord): LedgerTurn | undefined => {
  const id = String(entry.id);
  if (userTurnKinds.has(entry.kind)) return { id, role: "user", parts: [] };
  if (entry.kind !== brunchSignals.ledgerComments) return undefined;
  const { data } = entry;
  const body = JSON.stringify({
    comments:
      typeof data === "object" && data !== null && "comments" in data
        ? data.comments
        : null,
  });
  return parseLedgerComments(body) === undefined
    ? undefined
    : {
        id,
        role: "system",
        signal: { tagName: brunchSignals.ledgerComments },
        parts: [{ type: "text", text: body }],
      };
};

/** The turns after `after`, through the last one before the call `callId`. */
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
      const turn = String(entry.id) === after ? undefined : turnOf(entry);
      if (turn !== undefined) turns.push(turn);
    }
    cursor = page.next;
  } while (cursor !== undefined);
  throw new Error(
    `Conversation ${conversationId} holds no ledger_commit call ${callId}.`,
  );
};

/** The ID of the latest turn a stored history holds. */
const lastTurnId = (ledger: Readonly<LedgerHistoryDoc>) =>
  ledger.messages.findLast(({ role }) => role !== "assistant")?.id;

/**
 * The Ledger's history as call `callId` sees it, read inside `tx` without
 * writing: the stored history `stored`, read by the caller, then the turns
 * opened since, through the last one before the call. So a turn with no
 * commit yet, such as Ledger comments, is in the history already.
 */
export const ledgerHistoryAt = async (
  tx: Tx,
  conversationId: ConversationId,
  callId: string,
  stored: Readonly<LedgerHistoryDoc> | undefined,
): Promise<LedgerHistory> => {
  const ledger = stored ?? emptyHistory();
  return {
    messages: [
      ...ledger.messages,
      ...(await turnsBefore(tx, conversationId, callId, lastTurnId(ledger))),
    ],
  };
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
    return v.parse(vLedgerAppendOutput, recorded.parts[0].output);

  const turns = await turnsBefore(
    tx,
    conversationId,
    callId,
    lastTurnId(ledger),
  );
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
