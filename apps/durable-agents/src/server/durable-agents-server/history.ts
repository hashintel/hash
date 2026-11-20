/**
 * `GET /chat/:id/messages`: a conversation's history as AI SDK `UIMessage[]`,
 * built from its stored entries, for a panel that opens a conversation.
 *
 * - An input entry is a user message named by its request ID, the message
 *   ID the client sent, so a reopened list holds the IDs the client sent and
 *   a resent message follows its first run; an input admitted otherwise
 *   (an old `pi.user`) is `durable:user:<entry ID>`. A `brunch.user` entry
 *   shows the user's words, `data.userText`, never the host context the
 *   model read with them; a `brunch.ledger-comments` entry is a
 *   `data-brunch-ledger-comments` part with the entry's `data`; any other
 *   input shows its text.
 * - The entries after an input, up to the next one, are its response
 *   `durable:<input entry ID>`, projected by the live stream's own writer
 *   (`projectResponseEntries`) and reduced by AI SDK's own reducer, so a
 *   reopened response has the live stream's ID and parts: a browser tool's
 *   output from its result's `details`, and a hand-edit note that landed
 *   inside it as a `data-brunch-hand-edit` part.
 * - A hand-edit note outside every response (between turns, or after a
 *   response's last output) is a user message of its own with only that
 *   part, as the model read it as a user message, named by its report's
 *   request ID.
 * - An input withdrawn before it ran, behind a failed run or by a stop, has
 *   no entry: admission records each input it queues (`QueuedInputsDoc`),
 *   so it shows as its user message, in admission order, with metadata
 *   `withdrawn` saying why and no response.
 * - Everything else is hidden: prune writes (the tool results they edit
 *   show their stored output), compaction summaries, resets, prompt entries.
 *
 * A message's metadata is the Brunch library's
 * `DurableHistoryMessageMetadata`, from the input's submission: a response
 * whose input settled unanswered is `stopped` by a user's stop, or `failed`
 * by a failed run or a crash-loop abort (`CrashLoopEntry`), and a user
 * message whose input carried a new version load (`VersionLoadsDoc`) names
 * it in `versionLoad`. A turn that ended before any output has no response
 * to mark.
 *
 * Every entry is read, also those a compaction or reset left behind, so the
 * history is the whole conversation, not the model's context.
 */
import {
  type Conversation,
  type EntryId,
  type EntryRecord,
  type SubmissionId,
  type SubmissionRecord,
} from "@earendil-works/pi-durable";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

import {
  brunchSignals,
  type DurableHistoryMessageMetadata,
  durableHistoryPartTypes,
  type VersionLoad,
} from "@hashintel/brunch-agent";

import { handEditRequestId } from "../../browser-call/hand-edit";
import { handEditEntryKind } from "../../net-state/visible-net-view";
import { userWords } from "../../shared/brunch-user-entry";
import { VersionLoadsDoc } from "../../shared/version-loads-doc";
import { stoppedByCrashLoop } from "./shared/crash-loop-entry";
import { inputRequestId, isInputEntry } from "./shared/input-entry";
import { type QueuedInput, QueuedInputsDoc } from "./shared/queued-inputs-doc";
import {
  handEditPartId,
  type ProjectionOptions,
  projectResponseEntries,
} from "./submission-stream";

import type { OpenConversation } from "./conversation-registry";
import type { Context } from "@earendil-works/chord/context";
import type { Handler, Context as HonoContext } from "hono";

/** The ID of the user message an entry is shown as when it keeps no request ID. */
export const userMessageId = (entry: EntryId) => `durable:user:${entry}`;

/** Entries read per page. */
const pageSize = 500;

/** A hand-edit note's request ID, from the report its data names. */
const noteRequestId = (note: EntryRecord): string | undefined => {
  const { data } = note;
  return typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    typeof data.reportId === "string"
    ? handEditRequestId(data.reportId)
    : undefined;
};

/** An input entry's data as the panel sent it, without the request ID admission added. */
const sentData = ({ data }: Pick<EntryRecord, "data">) => {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return data ?? null;
  const { requestId: _requestId, ...sent } = data;
  return sent;
};

const inputParts = (
  entry: Pick<EntryRecord, "kind" | "data" | "model">,
): UIMessage["parts"] =>
  entry.kind === brunchSignals.ledgerComments
    ? [
        {
          type: durableHistoryPartTypes.ledgerComments,
          data: sentData(entry),
        },
      ]
    : [
        {
          type: "text",
          // A `brunch.user` envelope that did not parse was admitted, and is shown, as sent.
          text: userWords(entry),
          state: "done",
        },
      ];

/** How an unanswered input ended: stopped by the user, or failed, a crash-loop abort included. */
type UnansweredAs = "stopped" | "failed";

const unansweredAs = (
  submission: SubmissionRecord | undefined,
  entries: readonly EntryRecord[],
): UnansweredAs | undefined => {
  if (submission?.status !== "unanswered") return undefined;
  return submission.reason === "aborted" &&
    !stoppedByCrashLoop(entries, submission.id)
    ? "stopped"
    : "failed";
};

/** A response's metadata, by how its input ended. */
const endedMetadata = {
  stopped: { stopped: true },
  failed: { failed: true },
} as const satisfies Record<UnansweredAs, DurableHistoryMessageMetadata>;

/**
 * What the history reads beside the entries, from the submission table and
 * the documents admission records in.
 */
export type HistoryRecords = {
  /** Each input entry's submission, by the entry's ID; none for an input admitted under no request ID. */
  readonly inputs: ReadonlyMap<EntryId, SubmissionRecord>;
  /** Each input admission recorded as queued, with its submission. */
  readonly queued: readonly {
    readonly input: QueuedInput;
    readonly submission: SubmissionRecord | undefined;
  }[];
  /** Each new version load, by the submission whose input carried it. */
  readonly versionLoads: ReadonlyMap<SubmissionId, VersionLoad>;
};

const noRecords: HistoryRecords = {
  inputs: new Map(),
  queued: [],
  versionLoads: new Map(),
};

/** `metadata`, or nothing when it says nothing. */
const someMetadata = (metadata: DurableHistoryMessageMetadata) =>
  Object.keys(metadata).length > 0 ? { metadata } : {};

const inputMessage = (
  entry: EntryRecord,
  versionLoad: VersionLoad | undefined,
): UIMessage => ({
  id: inputRequestId(entry) ?? userMessageId(entry.id),
  role: "user",
  parts: inputParts(entry),
  ...someMetadata(versionLoad === undefined ? {} : { versionLoad }),
});

/** An input withdrawn before it ran, and why. */
type WithdrawnInput = {
  readonly input: QueuedInput;
  readonly because: UnansweredAs;
};

const withdrawnMessage = (
  { input, because }: WithdrawnInput,
  versionLoad: VersionLoad | undefined,
): UIMessage => ({
  id: input.requestId,
  role: "user",
  parts: inputParts({
    kind: input.kind,
    data: input.data,
    model: [{ role: "user", content: input.content, timestamp: 0 }],
  }),
  ...someMetadata({
    withdrawn: because,
    ...(versionLoad === undefined ? {} : { versionLoad }),
  }),
});

const noteMessage = (note: EntryRecord): UIMessage => ({
  id: noteRequestId(note) ?? userMessageId(note.id),
  role: "user",
  parts: [
    {
      type: durableHistoryPartTypes.handEdit,
      id: handEditPartId(note.id),
      data: note.data ?? null,
    },
  ],
});

/** The message AI SDK's reducer builds from a response's chunks, as a client does from the live stream. */
const reduce = async (
  chunks: readonly UIMessageChunk[],
): Promise<UIMessage | undefined> => {
  const stream = new ReadableStream<UIMessageChunk>({
    start: (controller) => {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  let message: UIMessage | undefined;
  for await (const next of readUIMessageStream({
    stream,
    terminateOnError: true,
  })) {
    message = next;
  }
  return message;
};

/**
 * The UI messages of `entries`, a conversation's stored entries in ID order,
 * with the withdrawn inputs `records` names among them in submission order.
 */
export const historyMessages = async (
  entries: readonly EntryRecord[],
  options: ProjectionOptions,
  records: HistoryRecords = noRecords,
): Promise<UIMessage[]> => {
  /** Each input with the entries after it, and the notes before the first input. */
  const turns: { input: EntryRecord; after: EntryRecord[] }[] = [];
  const leading: EntryRecord[] = [];
  for (const entry of entries) {
    if (isInputEntry(entry)) turns.push({ input: entry, after: [] });
    else if (turns.length > 0) turns.at(-1)?.after.push(entry);
    else if (entry.kind === handEditEntryKind) leading.push(entry);
  }

  const responses = await Promise.all(
    turns.map(async ({ input, after }) => {
      const { chunks, notesBefore, notesAfter } = projectResponseEntries(
        input.id,
        after,
        options,
      );
      return { response: await reduce(chunks), notesBefore, notesAfter };
    }),
  );

  const messages = leading.map(noteMessage);
  const pending = records.queued.flatMap(({ input, submission }) => {
    const because =
      submission?.entry === undefined
        ? unansweredAs(submission, entries)
        : undefined;
    return because === undefined ? [] : [{ input, because }];
  });
  /** Each withdrawn input admitted before `entry`, so before the input placed as it; all of them without one. */
  const withdrawnBefore = (entry: EntryId | undefined) => {
    let next = pending[0];
    // Pi mints submission and entry IDs from one ascending namespace.
    while (
      next !== undefined &&
      (entry === undefined || next.input.submission < entry)
    ) {
      messages.push(
        withdrawnMessage(next, records.versionLoads.get(next.input.submission)),
      );
      pending.shift();
      next = pending[0];
    }
  };
  turns.forEach(({ input }, index) => {
    withdrawnBefore(input.id);
    const submission = records.inputs.get(input.id);
    messages.push(
      inputMessage(
        input,
        submission && records.versionLoads.get(submission.id),
      ),
    );
    const projected = responses[index];
    if (projected === undefined) return;
    const { response, notesBefore, notesAfter } = projected;
    messages.push(...notesBefore.map(noteMessage));
    const endedAs = unansweredAs(submission, entries);
    if (response !== undefined)
      messages.push({
        ...response,
        ...someMetadata(endedAs === undefined ? {} : endedMetadata[endedAs]),
      });
    messages.push(...notesAfter.map(noteMessage));
  });
  withdrawnBefore(undefined);
  return messages;
};

/** Every stored entry of `conversation`, oldest first. */
const allEntries = async (
  conversation: Conversation,
  context: Context,
): Promise<EntryRecord[]> => {
  const entries: EntryRecord[] = [];
  let cursor: Parameters<Conversation["entries"]>[2];
  do {
    // Each page continues the one before.
    // eslint-disable-next-line no-await-in-loop
    const page = await conversation.entries(
      { order: "ascending" },
      pageSize,
      cursor,
      context,
    );
    entries.push(...page.items);
    cursor = page.next;
  } while (cursor !== undefined);
  return entries;
};

/**
 * Read the records `entries` need: the documents admission records in, and
 * the submissions, in one commit that writes nothing, so Pi stores nothing:
 * each input's, by the request ID its entry keeps, and each recorded queued
 * input's.
 */
const historyRecords = async (
  { harness, root }: OpenConversation,
  entries: readonly EntryRecord[],
  context: Context,
): Promise<HistoryRecords> => {
  const [queuedDoc, loadsDoc] = await Promise.all([
    harness.snapshot(QueuedInputsDoc, root.id, context),
    harness.snapshot(VersionLoadsDoc, root.id, context),
  ]);
  const recorded = queuedDoc?.inputs ?? [];
  const inputs = entries.flatMap((entry) => {
    const requestId = isInputEntry(entry) ? inputRequestId(entry) : undefined;
    return requestId === undefined ? [] : [{ entry: entry.id, requestId }];
  });
  const [inputSubmissions, queuedSubmissions] = await root.commit(
    (tx) =>
      Promise.all([
        Promise.all(
          inputs.map(({ requestId }) =>
            tx.submissionByRequest(root.id, requestId),
          ),
        ),
        Promise.all(
          recorded.map(({ submission }) => tx.submission(submission)),
        ),
      ]),
    context,
  );
  return {
    inputs: new Map(
      inputs.flatMap(({ entry }, index) => {
        const submission = inputSubmissions[index];
        return submission === undefined ? [] : [[entry, submission] as const];
      }),
    ),
    queued: recorded.map((input, index) => ({
      input,
      submission: queuedSubmissions[index],
    })),
    versionLoads: new Map(
      (loadsDoc?.loads ?? []).map(({ submission, id, decisionTime }) => [
        submission,
        { id, decisionTime },
      ]),
    ),
  };
};

export type HistoryRouteOptions = ProjectionOptions & {
  /** The server's conversations: an unknown ID is a 404, and nothing is created. */
  readonly conversations: {
    readonly acquire: (
      conversationId: string,
    ) => Promise<OpenConversation | undefined>;
  };
  /** Checks the request against the open conversation before it is read; a response refuses it. */
  readonly admit?: (
    conversation: OpenConversation,
    request: HonoContext,
  ) => Promise<Response | undefined>;
  readonly context: Context;
};

/** The handler of `GET /chat/:id/messages`, for the server to mount. */
export const historyHandler =
  ({
    conversations,
    admit,
    context,
    ...projection
  }: HistoryRouteOptions): Handler =>
  async (ctx) => {
    const conversation = await conversations.acquire(ctx.req.param("id") ?? "");
    if (conversation === undefined)
      return ctx.text("Unknown conversation.", 404);
    const refused = await admit?.(conversation, ctx);
    if (refused !== undefined) return refused;
    const entries = await allEntries(conversation.root, context);
    const messages = await historyMessages(
      entries,
      projection,
      await historyRecords(conversation, entries, context),
    );
    ctx.header("Cache-Control", "no-store");
    return ctx.json(messages);
  };
