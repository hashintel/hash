import {
  type PluginHook,
  usePluginService,
} from "@hashintel/petrinaut/ui/plugin";

import { voiceStartAction } from "../_shared/chat/voice-start-action";
import { BrunchPlugin } from "../brunch/definition";
import { VoicePlugin } from "./definition";
import { useBrunchVoice } from "./plugin/use-brunch-voice";

export const useVoicePlugin: PluginHook<typeof VoicePlugin> = (api) => {
  const brunch = usePluginService(BrunchPlugin);
  const voice = useBrunchVoice({
    shown: api.assistant.isActive,
    conversation: brunch?.conversation ?? null,
    enabled: api.settings.get("voice"),
    realtime: api.settings.get("realtime"),
  });

  return {
    assistant: { startActions: voice.available ? [voiceStartAction] : [] },
    provides: voice.chat,
  };
};

/**
 * Voice mode for Brunch. It has no `access`: Voice cannot read or change the
 * net, only Brunch's conversation.
 */
export const voicePlugin = VoicePlugin(useVoicePlugin);
