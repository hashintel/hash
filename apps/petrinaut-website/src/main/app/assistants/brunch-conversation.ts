/**
 * The service the Brunch plugin provides to plugins that extend its
 * conversation, Voice mode first. It is the one boundary between the two
 * folders: `brunch/` fills it, `voice/` consumes it.
 */

import { definePluginToken } from "@hashintel/petrinaut/ui";

import type { BrunchPanelConversationTracker } from "./brunch/brunch-panel-transport";
import type {
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";
import type { ReadableStore } from "@hashintel/petrinaut-core";
import type {
  PetrinautAiMessage,
  PetrinautAiVoiceMode,
} from "@hashintel/petrinaut/ui";

/** The live Brunch conversation for the open document, as Voice observes it. */
export interface BrunchConversationState {
  readonly conversationId: string;
  readonly tracker: BrunchPanelConversationTracker;
  readonly settlements: readonly FlueConversationSettlement[];
  readonly snapshot: FlueConversationState | undefined;
}

/** An input mode another plugin adds to Brunch's chat: Voice today. */
export interface BrunchInputMode {
  /** Renders the mode's controls in the chat composer area. */
  readonly renderVoiceMode?: PetrinautAiVoiceMode;
  /** Projects the transcript for display, e.g. voice captions. */
  readonly mapMessagesForDisplay?: (
    messages: PetrinautAiMessage[],
  ) => PetrinautAiMessage[];
}

export interface BrunchConversationApi {
  /** Whether Brunch is the assistant the editor shows. */
  readonly active: ReadableStore<boolean>;
  /** `null` until a document is bound to a conversation. */
  readonly conversation: ReadableStore<BrunchConversationState | null>;
  /** Adds an input mode; the returned function removes it. One at a time. */
  registerInputMode(mode: BrunchInputMode): () => void;
}

export const BrunchConversation = definePluginToken<BrunchConversationApi>(
  "website.brunch.conversation",
);
