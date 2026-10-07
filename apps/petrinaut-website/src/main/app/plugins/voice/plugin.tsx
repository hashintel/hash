import { type PluginHook, usePluginService } from "@hashintel/petrinaut/ui";

import { AiVoiceModeIcon } from "../_shared/chat/ai-voice-mode-icon";
import { voiceStartActionId } from "../_shared/chat/composer-control";
import { createBrunchPlugin } from "../brunch/definition";
import { createVoicePlugin } from "./definition";
import { useBrunchVoice } from "./plugin/use-brunch-voice";

/** The empty-net prompt's way into voice; Brunch's chat starts voice mode on it. */
const voiceStartAction = {
  id: voiceStartActionId,
  label: "Start voice mode",
  icon: <AiVoiceModeIcon size={20} />,
};

const useVoicePlugin: PluginHook<typeof createVoicePlugin> = (api) => {
  const brunch = usePluginService(createBrunchPlugin);
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
export const voicePlugin = createVoicePlugin(useVoicePlugin);
