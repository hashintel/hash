/**
 * Brunch as an assistant plugin while the demo shell still builds Brunch's
 * chat: the shell provides the chat's props and the Ledger tab through
 * `BrunchBridgeContext`, and the plugin renders them in the assistant window.
 */

import { createContext, use } from "react";

import {
  definePetrinautPlugin,
  type PetrinautPlugin,
  type PluginAssistantStartAction,
  type PluginAssistantTab,
  type PluginHook,
} from "@hashintel/petrinaut/ui";

import { AiVoiceModeIcon } from "../plugins/_shared/chat/ai-voice-mode-icon";
import {
  AssistantChat,
  type AssistantChatProps,
} from "../plugins/_shared/chat/assistant-chat";
import { editorPlugins } from "../plugins/demo-plugins";

/** What the shell gives Brunch's view: `null` until the document is bound to a conversation. */
export interface BrunchBridge {
  readonly chat: Omit<AssistantChatProps, "api"> | null;
  readonly ledger: PluginAssistantTab | null;
}

export const BrunchBridgeContext = createContext<BrunchBridge>({
  chat: null,
  ledger: null,
});

const createBrunchBridgePlugin = definePetrinautPlugin({
  id: "website.brunch",
  name: "Brunch",
  description:
    "HASH's process agent: builds and revises the net from a conversation, runs experiments, and keeps a Ledger of what it did.",
  author: "HASH",
  access: { document: "write", experiments: "write" },
  assistant: { label: "Brunch" },
});

/** The empty-net prompt's way into the chat's Voice mode. */
const voiceStartAction: PluginAssistantStartAction = {
  id: "voice",
  label: "Start voice mode",
  icon: <AiVoiceModeIcon size={20} />,
};

const useBrunchBridgePlugin: PluginHook<typeof createBrunchBridgePlugin> = (
  api,
) => {
  const { chat, ledger } = use(BrunchBridgeContext);

  return {
    assistant: {
      view: chat === null ? null : <AssistantChat api={api} {...chat} />,
      tabs: ledger === null ? [] : [ledger],
      startActions:
        chat?.renderVoiceMode === undefined ? [] : [voiceStartAction],
    },
  };
};

const brunchBridgePlugin = createBrunchBridgePlugin(useBrunchBridgePlugin);

/** The demo's plugins with Brunch as the assistant. */
export const brunchDemoPlugins: readonly PetrinautPlugin[] = [
  ...editorPlugins,
  brunchBridgePlugin,
];
