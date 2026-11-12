/**
 * The net view the model last saw, derived only from what it was sent: the
 * effective `ContextView.messages`, in order (Pi's call order, edits applied,
 * orphans dropped), and only the host-rendered content in them. Tool results
 * are recognised by role and tool name, sections by key, and notes by their
 * entry's kind; `details`, browser-call records, summaries and model or user
 * text count for nothing.
 *
 * - A `net_view` section holding a complete `<net-view>` block is a view,
 *   while Pi's in-order replay of section patches still shows it: a later
 *   patch that replaces or deletes (`null`) the section removes its view.
 *   Pi leads with the post-compaction baseline, so it sits at the head and
 *   later events override it.
 * - A successful net-showing tool result with complete net content is a
 *   view: a `read`, or a change's `read-back`. A result Pi's output bound
 *   cut is not one, so the earlier view stays.
 * - A hand-edit note after a view records its revision; the latest note
 *   decides: the view is stale exactly when it names another revision.
 *   Revisions are content hashes with no order, so only the latest counts.
 *   A note before any view is ignored.
 *
 * `pruneEdits` decides the read-back pruning write over the same view.
 */
import { browserToolFacts } from "@hashintel/brunch-agent";

import { mayShowNet } from "./net-view";
import {
  handEditEntryKind,
  netViewSectionKey,
  parseHandEditNote,
  parseNetResultText,
  parseNetViewSection,
  renderPlainResult,
} from "./visible-net-view/model-renderings";

import type { Message, ToolResultMessage } from "@earendil-works/pi-ai";
import type {
  ContextEdit,
  ContextView,
  EntryRecord,
} from "@earendil-works/pi-durable";

export {
  handEditEntryKind,
  type NetResultText,
  netViewSectionKey,
  parseHandEditNote,
  parseNetResultText,
  parseNetViewSection,
  renderBrowserResult,
  renderHandEditNote,
  renderNetChange,
  renderNetRead,
  renderNetViewSection,
  renderPlainResult,
} from "./visible-net-view/model-renderings";

export type NetViewKind = "read" | "read-back" | "section";

/** What one effective message says about the net, if anything. */
export type NetEvent =
  | {
      readonly type: "view";
      readonly kind: NetViewKind;
      readonly revision: string;
      /** The net as the view shows it: a read's output, a change's read-back, a section's block body. */
      readonly body: string;
    }
  | { readonly type: "note"; readonly revision: string };

export type VisibleNetView =
  | { readonly state: "none" }
  | {
      readonly state: "stale";
      /** The latest view's revision. */
      readonly seen: string;
      /** The revision the latest note after it names. */
      readonly edited: string;
      /** The latest view's message, as `ContextView.messages` holds it. */
      readonly message: Message;
    }
  | {
      readonly state: "current";
      readonly revision: string;
      readonly kind: NetViewKind;
      /** The net as the view shows it, as `NetEvent`'s `body`. */
      readonly body: string;
      /** The latest view's message, as `ContextView.messages` holds it. */
      readonly message: Message;
    };

/** Pi's diagnostics follow a result's output as their own text part. */
const truncationDiagnostic = /^<harness>\n[\s\S]*Output truncated/u;

const textParts = (message: Message): string[] =>
  typeof message.content === "string"
    ? [message.content]
    : message.content.flatMap((part) =>
        part.type === "text" ? [part.text] : [],
      );

/** A successful net-showing tool result whose net content is complete, parsed. */
const toolView = (message: ToolResultMessage) => {
  if (message.isError || !mayShowNet(message.toolName)) return undefined;
  const [first, ...rest] = textParts(message);
  if (first === undefined) return undefined;
  if (rest.some((text) => truncationDiagnostic.test(text))) return undefined;
  const parsed = parseNetResultText(first);
  if (parsed === undefined) return undefined;
  if (browserToolFacts(message.toolName).observesNet)
    return {
      kind: "read" as const,
      parsed,
      body: renderPlainResult(parsed.output),
    };
  return "netAfterChanges" in parsed
    ? {
        kind: "read-back" as const,
        parsed,
        body: renderPlainResult(parsed.netAfterChanges),
      }
    : undefined;
};

/** What `message` says about the net; `entryKind` is the kind of the entry that contributed it. */
export const netEventOf = (
  message: Message,
  entryKind: string | undefined,
): NetEvent | undefined => {
  switch (message.role) {
    case "system": {
      const text = message.sections?.[netViewSectionKey];
      const section =
        typeof text === "string" ? parseNetViewSection(text) : undefined;
      return section && { type: "view", kind: "section", ...section };
    }
    case "toolResult": {
      const view = toolView(message);
      return (
        view && {
          type: "view",
          kind: view.kind,
          revision: view.parsed.netRevision,
          body: view.body,
        }
      );
    }
    case "user": {
      if (entryKind !== handEditEntryKind) return undefined;
      const revision = parseHandEditNote(textParts(message).join(""));
      return revision === undefined ? undefined : { type: "note", revision };
    }
    default:
      return undefined;
  }
};

/** Each effective message's entry, by identity: `contributions` holds the same message objects. */
const entriesByMessage = (
  view: Pick<ContextView, "entries" | "contributions">,
): Map<Message, EntryRecord> => {
  const entries = new Map<Message, EntryRecord>();
  view.contributions.forEach((messages, index) => {
    const entry = view.entries[index];
    if (entry === undefined) return;
    for (const message of messages) entries.set(message, entry);
  });
  return entries;
};

/**
 * The one system message whose `net_view` patch is in effect after Pi
 * replays every patch in order (`replaySections`: a string sets the section,
 * `null` deletes it), or undefined when none sets it or the last deletes it.
 * Only that message's section can be a view: an earlier rendering the section
 * replaced or deleted is no longer shown.
 */
const shownSectionMessage = (
  messages: readonly Message[],
): Message | undefined => {
  let shown: Message | undefined;
  for (const message of messages) {
    if (message.role !== "system" || message.sections === undefined) continue;
    const value = message.sections[netViewSectionKey];
    if (value === null) shown = undefined;
    else if (value !== undefined) shown = message;
  }
  return shown;
};

/** The net view the model last saw in `view`'s effective messages. */
export const visibleNetView = (
  view: Pick<ContextView, "entries" | "contributions" | "messages">,
): VisibleNetView => {
  const entries = entriesByMessage(view);
  const section = shownSectionMessage(view.messages);
  let latest:
    | (Extract<NetEvent, { type: "view" }> & { readonly message: Message })
    | undefined;
  let note: string | undefined;
  for (const message of view.messages) {
    if (message.role === "system" && message !== section) continue;
    const event = netEventOf(message, entries.get(message)?.kind);
    if (event === undefined) continue;
    if (event.type === "view") {
      latest = { ...event, message };
      note = undefined;
    } else if (latest !== undefined) note = event.revision;
  }
  if (latest === undefined) return { state: "none" };
  if (note !== undefined && note !== latest.revision)
    return {
      state: "stale",
      seen: latest.revision,
      edited: note,
      message: latest.message,
    };
  return {
    state: "current",
    revision: latest.revision,
    kind: latest.kind,
    body: latest.body,
    message: latest.message,
  };
};

/**
 * The read-back pruning write's edits: every complete read-back in the
 * effective context but the latest view's loses its read-back, replaced by
 * its effective message with the bare output, so earlier edits are kept.
 * Reads, sections and notes are never targeted, and nothing is without a
 * view, current or stale.
 */
export const pruneEdits = (
  view: Pick<ContextView, "entries" | "contributions" | "messages">,
): ContextEdit[] => {
  const latest = visibleNetView(view);
  if (latest.state === "none") return [];
  const entries = entriesByMessage(view);
  return view.messages.flatMap((message): ContextEdit[] => {
    if (message === latest.message || message.role !== "toolResult") return [];
    const shown = toolView(message);
    const target = entries.get(message);
    if (shown?.kind !== "read-back" || target === undefined) return [];
    const pruned = renderPlainResult(shown.parsed.output);
    let replaced = false;
    return [
      {
        target: target.id,
        action: "replace",
        messages: [
          {
            ...message,
            content: message.content.map((part) => {
              if (part.type !== "text" || replaced) return part;
              replaced = true;
              return { ...part, text: pruned };
            }),
          },
        ],
      },
    ];
  });
};
