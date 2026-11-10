/**
 * Which tool results the model saw when it issued a call, read from the
 * committed transcript. Brunch observes this from each request's context
 * projection and keeps it in memory; here it is derived at tool time from the
 * entries, so it survives a restart and needs no hook that writes.
 *
 * The derivation follows Pi Durable's context reading
 * (`harness/context.d.ts`): the newest head marker at or before the
 * assistant entry starts the context (a compaction's summary, then the entries
 * from its first kept one; a reset itself), later edits omit or replace an
 * entry's messages, and a round's results count only when they follow their
 * assistant message, before the next one.
 */
import type {
  ContextEdit,
  ConversationId,
  Cursor,
  EntryId,
  EntryRecord,
  Tx,
} from "@earendil-works/pi-durable";

/** A call whose successful result is in the model's context. */
export type ViewedCall = {
  readonly toolCallId: string;
  readonly toolName: string;
};

/** The context's entries through `through`, oldest first: the head marker, then the rest from its head on. */
const contextEntries = async (
  tx: Tx,
  conversationId: ConversationId,
  through: EntryId,
) => {
  const newestFirst: EntryRecord[] = [];
  let marker: EntryRecord | undefined;
  let cursor: Cursor | undefined;
  scan: do {
    // eslint-disable-next-line no-await-in-loop -- Each page continues from the last one's cursor.
    const page = await tx.scanEntries(
      { conversationId, maxEntryId: through, order: "descending" },
      100,
      cursor,
    );
    for (const entry of page.items) {
      if (marker?.head !== undefined && entry.id < marker.head) break scan;
      marker ??= entry.head === undefined ? undefined : entry;
      newestFirst.push(entry);
    }
    cursor = page.next;
  } while (cursor !== undefined);
  return [
    ...(marker === undefined ? [] : [marker]),
    ...newestFirst.filter(({ head }) => head === undefined).reverse(),
  ];
};

/** Each entry's messages after the newest edit of it. */
const contextMessages = (entries: readonly EntryRecord[]) => {
  const edits = new Map<EntryId, ContextEdit>();
  for (const entry of entries)
    for (const edit of entry.edits ?? []) edits.set(edit.target, edit);
  return entries.flatMap((entry) => {
    const edit = edits.get(entry.id);
    if (edit?.action === "omit") return [];
    if (edit?.action === "replace") return edit.messages;
    return entry.model ?? [];
  });
};

/**
 * The calls, in the order the model issued them, whose successful results
 * are in the context that ends at the assistant entry `through`: the view
 * the model had when that entry's response was generated.
 */
export const viewedCalls = async (
  tx: Tx,
  conversationId: ConversationId,
  through: EntryId,
): Promise<ViewedCall[]> => {
  const rounds: { calls: ViewedCall[]; succeeded: Set<string> }[] = [];
  for (const message of contextMessages(
    await contextEntries(tx, conversationId, through),
  )) {
    if (message.role === "assistant")
      rounds.push({
        calls: message.content.flatMap((content) =>
          content.type === "toolCall"
            ? [{ toolCallId: content.id, toolName: content.name }]
            : [],
        ),
        succeeded: new Set(),
      });
    else if (message.role === "toolResult" && !message.isError)
      rounds.at(-1)?.succeeded.add(message.toolCallId);
  }
  return rounds.flatMap(({ calls, succeeded }) =>
    calls.filter(({ toolCallId }) => succeeded.has(toolCallId)),
  );
};
