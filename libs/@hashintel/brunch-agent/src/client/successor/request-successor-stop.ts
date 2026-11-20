import {
  type SuccessorConversation,
  successorEndpoints,
  successorHeaders,
} from "./successor-endpoints";

import type { PetrinautAiStopResult } from "../../ui/chat/petrinaut";
import type { BrunchPanelConversationTracker } from "../brunch-panel-transport";

/**
 * Stop the conversation on the durable agents server: its running turn and
 * its queued inputs. The server's abort is conversation-wide and always
 * succeeds, so it cannot say whether anything was still running; a stop
 * reports only that it was requested. A Stop pressed while a send is in
 * flight waits for that send's answer first, so an input admitted just
 * after the abort does not run on.
 */
export const requestSuccessorStop = async (
  conversation: SuccessorConversation,
  tracker: BrunchPanelConversationTracker,
): Promise<PetrinautAiStopResult> => {
  tracker.recordStopRequested();
  await tracker.settleInFlightSubmissions();
  return abortConversation(conversation);
};

/**
 * `requestSuccessorStop`, unless `stillWanted` says otherwise once the
 * in-flight sends settle: a message sent meanwhile withdraws the stop.
 */
export const requestSuccessorStopIfStillWanted = async (
  conversation: SuccessorConversation,
  tracker: BrunchPanelConversationTracker,
  stillWanted: () => boolean,
): Promise<PetrinautAiStopResult | "withdrawn"> => {
  await tracker.settleInFlightSubmissions();
  if (!stillWanted()) return "withdrawn";
  tracker.recordStopRequested();
  return abortConversation(conversation);
};

const abortConversation = async (
  conversation: SuccessorConversation,
): Promise<PetrinautAiStopResult> => {
  const { abort } = await successorEndpoints(conversation);
  const response = await (conversation.fetch ?? globalThis.fetch)(abort, {
    method: "POST",
    headers: successorHeaders(conversation),
    credentials: "include",
  });
  // An unknown conversation has nothing running to stop.
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `The server did not stop the conversation (HTTP ${response.status}): ${await response.text()}`,
    );
  }
  return "stop-requested";
};
