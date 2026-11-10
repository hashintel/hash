/**
 * Whether the model still sees a current view of the bound net, as Brunch's
 * `apps/brunch-agent/src/shared/conversation/net-freshness.ts` decides it: a
 * document change is issued only against the revision of the latest net
 * result the model can still see, and the browser refuses it if the document
 * has since moved by other means.
 *
 * Brunch's view is the set of results its context projection last carried,
 * kept in process memory. Here it is the successful results in the committed
 * context that ends at the call's assistant entry (`viewedCalls`), and each
 * result's metadata is its browser-call record's, so the view survives a
 * restart.
 */
import { getLatestNetDefinitionToolName } from "@hashintel/petrinaut-core/ai";

import { netResultView } from "./net-view";

import type { BrowserCallRecord } from "../browser-call/browser-call";
import type { ViewedCall } from "./net-freshness/model-context";

export { viewedCalls } from "./net-freshness/model-context";

/** Copied from Brunch's `net-freshness.ts`. */
export const noNetViewRefusal = `Not started: no current view of the net is in your context, either because none was read or because it was compacted away. Read the net (readNetOutline, readNetStructure or ${getLatestNetDefinitionToolName}), then make the change.`;

/**
 * The revision of the latest net result in `view` that shows the model the
 * net. Reads carry the revision they observed; a change carries the revision
 * it produced only when it also carries the net read back. A change that left
 * the document as it was, or whose read-back is missing, shows nothing.
 * `view` holds only calls issued before the one asking, in issue order.
 */
export const expectedNetRevision = (
  view: readonly ViewedCall[],
  calls: Readonly<
    Record<string, Pick<BrowserCallRecord, "status" | "metadata">>
  >,
): { readonly revision: string } | { readonly refusal: string } => {
  let revision: string | undefined;
  for (const { toolCallId, toolName } of view) {
    const record = calls[toolCallId];
    if (record?.status !== "settled" || record.metadata === null) continue;
    revision = netResultView(toolName, record.metadata)?.revision ?? revision;
  }
  return revision === undefined ? { refusal: noNetViewRefusal } : { revision };
};
