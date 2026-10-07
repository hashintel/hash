import { definePetrinautPlugin, pluginService } from "@hashintel/petrinaut/ui";

import { createBrunchPlugin } from "../brunch/definition";

import type { AssistantChatProps } from "../_shared/chat/assistant-chat";

/** What Voice gives Brunch's chat: the voice mode and the captions over the transcript. */
export type VoiceService = Pick<
  AssistantChatProps,
  "renderVoiceMode" | "mapMessagesForDisplay"
>;

/** Voice's definition: Brunch's chat reads its service. */
export const createVoicePlugin = definePetrinautPlugin({
  id: "website.voice",
  name: "Voice",
  description:
    "Talk to Brunch instead of typing: live or realtime speech in, spoken answers and captions out.",
  author: "HASH",
  assistant: { extends: createBrunchPlugin },
  settings: {
    voice: {
      type: "boolean",
      default: true,
      label: "Voice",
      section: "labs",
      description: "Talk to Brunch by voice.",
    },
    realtime: {
      type: "boolean",
      default: false,
      label: "Realtime mode",
      section: "labs",
      description:
        "Use the alternative voice engine if Voice isn’t working well.",
    },
  },
  provides: pluginService<VoiceService>(),
});
