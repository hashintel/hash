import type { PetrinautAiStopResult } from "../ui/chat/petrinaut";
import type { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import type { createFlueClient } from "@flue/sdk";

/**
 * Flue's `abort()` is conversation-wide and only reaches unsettled work, so a
 * Stop pressed while `send()` is still in flight must first let that admission
 * land; otherwise `aborted: false` would read as "already settled" while the
 * admitted turn keeps running. `stillWanted`, asked once that has settled and
 * just before the abort, can withdraw the stop.
 */
export const requestFlueStop = async (
  clientPromise: Promise<ReturnType<typeof createFlueClient>>,
  tracker: BrunchPanelConversationTracker,
  stillWanted: () => boolean = () => true,
): Promise<PetrinautAiStopResult> => {
  tracker.recordStopRequested();
  const client = await clientPromise;
  await tracker.settleInFlightSubmissions();
  if (!stillWanted()) return "already-settled";
  const result = await client.abort();
  return result.aborted ? "stop-requested" : "already-settled";
};
