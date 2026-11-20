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
 * - Everything else is hidden: prune writes (the tool results they edit
 *   show their stored output), compaction summaries, resets, prompt entries.
 *
 * Every entry is read, also those a compaction or reset left behind, so the
 * history is the whole conversation, not the model's context.
 */
import {
  type Conversation,
  type EntryId,
  type EntryRecord,
} from "@earendil-works/pi-durable";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

import { brunchSignals } from "@hashintel/brunch-agent";

import { handEditRequestId } from "../../browser-call/hand-edit";
import { handEditEntryKind } from "../../net-state/visible-net-view";
import { userWords } from "../../shared/brunch-user-entry";
import { inputRequestId, isInputEntry } from "./shared/input-entry";
import {
  handEditPartId,
  handEditPartType,
  type ProjectionOptions,
  projectResponseEntries,
} from "./submission-stream";

import type { OpenConversation } from "./conversation-registry";
import type { Context } from "@earendil-works/chord/context";
import type { Handler } from "hono";

/** The UI part a Ledger-comment turn is shown as, with the entry's `data` (`{ comments }`). */
export const ledgerCommentsPartType = "data-brunch-ledger-comments";

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
const sentData = ({ data }: EntryRecord) => {
  if (typeof data !== "object" || data === null || Array.isArray(data))
    return data ?? null;
  const { requestId: _requestId, ...sent } = data;
  return sent;
};

const inputMessage = (entry: EntryRecord): UIMessage => {
  const id = inputRequestId(entry) ?? userMessageId(entry.id);
  if (entry.kind === brunchSignals.ledgerComments)
    return {
      id,
      role: "user",
      parts: [{ type: ledgerCommentsPartType, data: sentData(entry) }],
    };
  return {
    id,
    role: "user",
    parts: [
      {
        type: "text",
        // A `brunch.user` envelope that did not parse was admitted, and is shown, as sent.
        text: userWords(entry),
        state: "done",
      },
    ],
  };
};

const noteMessage = (note: EntryRecord): UIMessage => ({
  id: noteRequestId(note) ?? userMessageId(note.id),
  role: "user",
  parts: [
    {
      type: handEditPartType,
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

/** The UI messages of `entries`, a conversation's stored entries in ID order. */
export const historyMessages = async (
  entries: readonly EntryRecord[],
  options: ProjectionOptions,
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
  turns.forEach(({ input }, index) => {
    messages.push(inputMessage(input));
    const projected = responses[index];
    if (projected === undefined) return;
    const { response, notesBefore, notesAfter } = projected;
    messages.push(...notesBefore.map(noteMessage));
    if (response !== undefined) messages.push(response);
    messages.push(...notesAfter.map(noteMessage));
  });
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

export type HistoryRouteOptions = ProjectionOptions & {
  /** The server's conversations: an unknown ID is a 404, and nothing is created. */
  readonly conversations: {
    readonly acquire: (
      conversationId: string,
    ) => Promise<OpenConversation | undefined>;
  };
  readonly context: Context;
};

/** The handler of `GET /chat/:id/messages`, for the server to mount. */
export const historyHandler =
  ({ conversations, context, ...projection }: HistoryRouteOptions): Handler =>
  async (ctx) => {
    const conversation = await conversations.acquire(ctx.req.param("id") ?? "");
    if (conversation === undefined)
      return ctx.text("Unknown conversation.", 404);
    const messages = await historyMessages(
      await allEntries(conversation.root, context),
      projection,
    );
    ctx.header("Cache-Control", "no-store");
    return ctx.json(messages);
  };
