/**
 * The read-back pruning write (fold 2a): after every tool round, every net
 * read-back but the latest visible view's loses its read-back, as one stored
 * edit, so the model sees the net's structure after its changes once.
 *
 * An `afterTools` hook runs once per round, after every result is durable and
 * before the commit that places the round's `postTools` boundary. It reads
 * the committed effective context through the host's Harness (current, since
 * queued writes wait for the boundary), decides `pruneEdits` over it, and
 * admits one `brunch.prune` write under the round's request ID, which the
 * boundary places before the next request. So the decision follows outcomes:
 * a failed or no-op sibling keeps the earlier read-back.
 *
 * - Replay: recovery reruns the round's tools phase and this hook; the
 *   request ID makes the write land once.
 * - Fail-safe: a throwing or unbound hook is reported and not retried, and
 *   the model sees an extra read-back, never none.
 * - Abort: the hook doesn't run; the next round with tools prunes.
 */
import {
  type ContextEdit,
  defineExtension,
  type EntryId,
  GenerationTask,
  hook,
} from "@earendil-works/pi-durable";

import { pruneEdits } from "../../net-state/visible-net-view";

import type { HostBinding } from "../host-binding";

/** The kind of the entry a pruning write appends. */
export const pruneEntryKind = "brunch.prune";

/** The request ID of a round's pruning write: one per issuing assistant entry. */
export const pruneRequestId = (assistant: EntryId) =>
  `${pruneEntryKind}:${assistant}`;

/** What a pruning entry carries. */
export type PruneEntryData = { readonly assistant: EntryId };

export const readBackPruningExtensionName = "brunch.read-back-pruning";

export const readBackPruningExtension = (host: HostBinding) =>
  defineExtension({
    name: readBackPruningExtensionName,
    hooks: [
      hook(GenerationTask, {
        afterTools: async (assistant, _results, api, context) => {
          // Outside any commit: a Harness read inside one waits on the line it holds.
          const conversation = await host.conversation(
            api.conversationId,
            context,
          );
          const edits: ContextEdit[] = pruneEdits(
            await conversation.context(context),
          );
          if (edits.length === 0) return;
          await conversation.submit(
            {
              type: "write",
              requestId: pruneRequestId(assistant),
              entry: {
                kind: pruneEntryKind,
                data: { assistant } satisfies PruneEntryData,
                edits,
              },
            },
            context,
          );
        },
      }),
    ],
  });
