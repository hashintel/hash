/**
 * `GET /chat/:id/messages`: a conversation's history as AI SDK `UIMessage[]`,
 * built from its stored entries, for a panel that opens a conversation.
 *
 * - An input entry is a user message `durable:user:<entry ID>`: a
 *   `brunch.user` entry shows the user's words, `data.userText`, never the
 *   host context the model read with them; a `brunch.ledger-comments` entry
 *   is a `data-brunch-ledger-comments` part with the entry's `data`; any
 *   other input shows its text.
 * - The entries after an input, up to the next one, are its response
 *   `durable:<input entry ID>`, projected by the live stream's own writer
 *   (`projectResponseEntries`) and reduced by AI SDK's own reducer, so a
 *   reopened response has the live stream's ID and parts: a browser tool's
 *   output from its result's `details`, and a hand-edit note that landed
 *   inside it as a `data-brunch-hand-edit` part.
 * - A hand-edit note outside every response (between turns, or after a
 *   response's last output) is a user message of its own with only that
 *   part, as the model read it as a user message.
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
  UserEntry,
} from "@earendil-works/pi-durable";
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from "ai";

import { brunchSignals } from "@hashintel/brunch-agent";

import { handEditEntryKind } from "../../net-state/visible-net-view";
import {
  handEditPartId,
  handEditPartType,
  type ProjectionOptions,
  projectResponseEntries,
} from "./submission-stream/view-projector";
import { brunchUserKind } from "./user-input";

import type { OpenConversation } from "./conversation-registry";
import type { Context } from "@earendil-works/chord";
import type { Handler } from "hono";

/** The UI part a Ledger-comment turn is shown as, with the entry's `data` (`{ comments }`). */
export const ledgerCommentsPartType = "data-brunch-ledger-comments";

/** The ID of the user message an entry is shown as. */
export const userMessageId = (entry: EntryId) => `durable:user:${entry}`;

/** Entry kinds an input is placed as: each starts a response. */
const inputKinds: ReadonlySet<string> = new Set([
  UserEntry.kind,
  brunchUserKind,
  brunchSignals.ledgerComments,
]);

/** Entries read per page. */
const pageSize = 500;

/** The text of an input entry's user message, as the model read it. */
const modelText = (entry: EntryRecord): string => {
  const message = entry.model?.[0];
  if (message?.role !== "user") return "";
  return typeof message.content === "string"
    ? message.content
    : message.content
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join("");
};

/** The user's own words of a `brunch.user` entry; an invalid envelope was admitted, and is shown, as sent. */
const userText = (entry: EntryRecord): string => {
  const { data } = entry;
  if (
    typeof data === "object" &&
    data !== null &&
    !Array.isArray(data) &&
    typeof data.userText === "string"
  )
    return data.userText;
  return modelText(entry);
};

const inputMessage = (entry: EntryRecord): UIMessage => {
  const id = userMessageId(entry.id);
  if (entry.kind === brunchSignals.ledgerComments)
    return {
      id,
      role: "user",
      parts: [{ type: ledgerCommentsPartType, data: entry.data ?? null }],
    };
  return {
    id,
    role: "user",
    parts: [
      {
        type: "text",
        text:
          entry.kind === brunchUserKind ? userText(entry) : modelText(entry),
        state: "done",
      },
    ],
  };
};

const noteMessage = (note: EntryRecord): UIMessage => ({
  id: userMessageId(note.id),
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
    if (inputKinds.has(entry.kind)) turns.push({ input: entry, after: [] });
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
