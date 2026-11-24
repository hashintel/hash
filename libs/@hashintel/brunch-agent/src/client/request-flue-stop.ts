import type { PetrinautAiStopResult } from "../ui/chat/petrinaut";
import type { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import type { createFlueClient } from "@flue/sdk";

type FlueClientPromise = Promise<ReturnType<typeof createFlueClient>>;

const abortConversation = async (
  client: ReturnType<typeof createFlueClient>,
): Promise<PetrinautAiStopResult> => {
  const result = await client.abort();
  return result.aborted ? "stop-requested" : "already-settled";
};

/**
 * Flue's `abort()` is conversation-wide and only reaches unsettled work, so a
 * Stop pressed while `send()` is still in flight must first let that admission
 * land; otherwise `aborted: false` would read as "already settled" while the
 * admitted turn keeps running. The Stop is announced at once, for the user who
 * pressed it.
 */
export const requestFlueStop = async (
  clientPromise: FlueClientPromise,
  tracker: BrunchPanelConversationTracker,
): Promise<PetrinautAiStopResult> => {
  tracker.recordStopRequested();
  const client = await clientPromise;
  await tracker.settleInFlightSubmissions();
  return abortConversation(client);
};

/**
 * A stop nobody pressed, which `stillWanted` can withdraw once the in-flight
 * admission has landed: then nothing is announced or aborted, and the turn
 * keeps running.
 */
export const requestFlueStopIfStillWanted = async (
  clientPromise: FlueClientPromise,
  tracker: BrunchPanelConversationTracker,
  stillWanted: () => boolean,
): Promise<PetrinautAiStopResult | "withdrawn"> => {
  const client = await clientPromise;
  await tracker.settleInFlightSubmissions();
  if (!stillWanted()) return "withdrawn";
  tracker.recordStopRequested();
  return abortConversation(client);
};
