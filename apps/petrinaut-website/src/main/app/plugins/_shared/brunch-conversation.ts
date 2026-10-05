/**
 * The service the Brunch plugin provides to plugins that extend its
 * assistant, Voice mode first. It is the one boundary between the two
 * folders: `brunch/` fills it, `voice/` consumes it.
 */

import { definePluginToken } from "@hashintel/petrinaut/ui";

import type { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import type {
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";

/** The live Brunch conversation for the open document, as Voice observes it. */
export interface BrunchConversationState {
  readonly conversationId: string;
  readonly tracker: BrunchPanelConversationTracker;
  readonly settlements: readonly FlueConversationSettlement[];
  readonly snapshot: FlueConversationState | undefined;
}

export interface BrunchConversationApi {
  /** `null` until Brunch is shown and the document is bound to a conversation. */
  readonly conversation: BrunchConversationState | null;
}

export const BrunchConversation = definePluginToken<BrunchConversationApi>(
  "website.brunch.conversation",
);
