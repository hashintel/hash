/**
 * Whether the model still sees a current view of the bound net, as Brunch's
 * `apps/brunch-agent/src/shared/conversation/net-freshness.ts` decides it: a
 * document change is issued only against the revision of the net view the
 * model last saw, and the browser refuses it if the document has since moved
 * by other means.
 *
 * The view is what the model was sent when it issued the call: the effective
 * context at the call's assistant entry, `context({ at })`, folded by
 * `visibleNetView`. Only host-rendered content counts, never `details` or
 * browser-call records. A context read at a fixed cutoff is stable against
 * later writes, so a rerun after a restart decides the same.
 */
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import { visibleNetView } from "./visible-net-view";

import type { HostBinding } from "../agent/host-binding";
import type { Context } from "@earendil-works/chord";
import type {
  ContextView,
  ConversationId,
  EntryId,
} from "@earendil-works/pi-durable";

/** Copied from Brunch's `net-freshness.ts`. */
export const noNetViewRefusal = `Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (readNetOutline, readNetStructure or ${getLatestNetDefinitionToolName}), then make the change.`;

/** Copied from `apps/brunch-agent/src/shared/conversation/browser-call-rendezvous.ts`: the panel's own wording. */
export const staleNetViewRefusal =
  "Not started: the document changed by other means after your last view of the net. Read the net again, then make the change.";

export type NetFreshness =
  | { readonly revision: string }
  | { readonly refusal: string };

/**
 * The revision a change may be issued against, from the net view the model
 * last saw in `view`: none refuses, a view a later hand-edit note made stale
 * refuses with the panel's wording, and a current view gives its revision.
 */
export const expectedNetRevision = (
  view: Pick<ContextView, "entries" | "contributions" | "messages">,
): NetFreshness => {
  const latest = visibleNetView(view);
  if (latest.state === "none") return { refusal: noNetViewRefusal };
  if (latest.state === "stale") return { refusal: staleNetViewRefusal };
  return { revision: latest.revision };
};

/**
 * Net freshness at issue: the context the model had when it issued the call
 * at `assistant`, read through the host's Harness. Outside any commit: a
 * Harness read inside one waits on the line the commit holds. Throws when the
 * host is unbound, which fails the call as a tool error.
 */
export const netFreshnessAtIssue = async (
  host: HostBinding,
  conversationId: ConversationId,
  assistant: EntryId,
  context: Context,
): Promise<NetFreshness> => {
  const conversation = await host.conversation(conversationId, context);
  return expectedNetRevision(
    await conversation.context(context, { at: assistant }),
  );
};
