/**
 * The `net_view` prompt section (Lu's decision 2): after a compaction whose
 * summary dropped it, the model keeps the net view it last saw.
 *
 * Native summarization never sees system messages, so a view the summarized
 * prefix held is gone from the context after compaction. Pi writes a complete
 * baseline `pi.system` entry after every compaction head, and leads the
 * context with it; this section's text rides in that baseline, so the restored
 * view is stored history at the head, not a request rewrite and not an entry
 * of its own.
 *
 * - With no compaction head, it renders nothing.
 * - When the kept tail (the messages after the head, before the first
 *   `pi.system` entry after it) holds a net event of its own, a tool view or a
 *   hand-edit note, the tail decides and it renders nothing. Stopping at the
 *   baseline makes the decision taken at the first request after a compaction
 *   hold until the next one, so the section never churns between them.
 * - Otherwise it folds the context as of the newest entry before the head
 *   with `visibleNetView`, and renders a `current` view; `stale` or `none`
 *   renders nothing. Its own earlier rendering counts as a view there, so a
 *   view survives repeated compaction.
 *
 * Its own errors render nothing: Pi would keep a throwing section's earlier
 * text, which could carry an older view into a new baseline. An abort still
 * propagates.
 */
import {
  CompactionEntry,
  type ContextView,
  type Conversation,
  defineExtension,
  type EntryId,
  type Extension,
  type PromptSection,
  section,
  SystemEntry,
} from "@earendil-works/pi-durable";

import {
  netEventOf,
  netViewSectionKey,
  renderNetViewSection,
  visibleNetView,
} from "../../net-state/visible-net-view";

import type { HostBinding } from "../host-binding";
import type { Context } from "@earendil-works/chord";

/**
 * Whether the kept tail decides the view: a tool view or a note among the
 * messages after the compaction head and before the baseline Pi writes after
 * it. System messages never decide; a restored section is the prefix's.
 */
const tailDecides = (view: ContextView, head: EntryId): boolean => {
  const baseline = view.entries.find(
    (entry) => entry.id > head && SystemEntry.is(entry),
  );
  return view.entries.some(
    (entry, index) =>
      entry.id !== head &&
      (baseline === undefined || entry.id < baseline.id) &&
      (view.contributions[index] ?? []).some(
        (message) =>
          message.role !== "system" &&
          netEventOf(message, entry.kind) !== undefined,
      ),
  );
};

/** The newest entry before `id`. */
const entryBefore = async (
  conversation: Conversation,
  id: EntryId,
  context: Context,
): Promise<EntryId | undefined> =>
  (
    await conversation.entries(
      { maxEntryId: (id - 1) as EntryId, order: "descending" },
      1,
      undefined,
      context,
    )
  ).items[0]?.id;

/** The section's text for `conversation`'s current context, if it restores a view. */
const restoredView = async (
  conversation: Conversation,
  context: Context,
): Promise<string | undefined> => {
  const view = await conversation.context(context);
  const head = view.head;
  if (!CompactionEntry.is(head) || tailDecides(view, head.id)) return undefined;
  const before = await entryBefore(conversation, head.id, context);
  if (before === undefined) return undefined;
  const prefix = visibleNetView(
    await conversation.context(context, { at: before }),
  );
  return prefix.state === "current"
    ? renderNetViewSection(prefix.revision, prefix.body)
    : undefined;
};

/** The `net_view` section, reading its conversation's context through `host`. */
export const netViewSection = (host: HostBinding): PromptSection =>
  section(netViewSectionKey, async (input, context) => {
    try {
      return await restoredView(
        await host.conversation(input.conversationId, context),
        context,
      );
    } catch (error) {
      // An aborted preparation stops, as Pi stops it for any section.
      if (context.abortSignal?.aborted) throw error;
      return undefined;
    }
  });

/** The extension a conversation selects for the section, over its Harness's host binding. */
export const netViewSectionExtension = (host: HostBinding): Extension =>
  defineExtension({
    name: "brunch.net-view-section",
    sections: [netViewSection(host)],
  });
