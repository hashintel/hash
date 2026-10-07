import { definePetrinautPlugin, pluginService } from "@hashintel/petrinaut/ui";

import type { BrunchPanelConversationTracker } from "./brunch-panel-transport";
import type { BrunchMutationApprovalCoordinator } from "./tools/brunch-mutation-approval";
import type {
  FlueConversationSettlement,
  FlueConversationState,
} from "@flue/sdk";

/** The open document's Brunch conversation, as Voice observes it. */
export interface BrunchConversation {
  readonly conversationId: string;
  readonly tracker: BrunchPanelConversationTracker;
  readonly settlements: readonly FlueConversationSettlement[];
  readonly snapshot: FlueConversationState | undefined;
  /** Whether a call waits on the user's approval or was refused, so Voice can say so. */
  readonly toolApprovalState: BrunchMutationApprovalCoordinator["approvalState"];
}

/** What Brunch offers the plugins that extend it. */
export interface BrunchService {
  /** `null` while another assistant is shown. */
  readonly conversation: BrunchConversation | null;
}

/** Brunch's definition: other plugins extend it and read its conversation service. */
export const createBrunchPlugin = definePetrinautPlugin({
  id: "website.brunch",
  name: "Brunch",
  description:
    "HASH's process agent: builds and revises the net from a conversation, runs experiments, and keeps a Ledger of what it did.",
  author: "HASH",
  access: { document: "write", experiments: "write" },
  assistant: { label: "Brunch" },
  provides: pluginService<BrunchService>(),
});
