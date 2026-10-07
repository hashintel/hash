import { AiVoiceModeIcon } from "./ai-voice-mode-icon";

import type { PluginAssistantStartAction } from "@hashintel/petrinaut/ui";

/**
 * The empty-net prompt's way into the chat's Voice mode. The chat starts in
 * Voice mode for a start request with this action's id.
 */
export const voiceStartAction: PluginAssistantStartAction = {
  id: "voice",
  label: "Start voice mode",
  icon: <AiVoiceModeIcon size={20} />,
};
