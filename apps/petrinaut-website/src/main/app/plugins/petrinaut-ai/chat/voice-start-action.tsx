import { AiVoiceModeIcon } from "./ai-voice-mode-icon";

import type { PluginAssistantStartAction } from "@hashintel/petrinaut/ui/plugin";

/**
 * The empty-net prompt's way into the chat's Voice mode.
 * `useAssistantChatStart` adds its `run`.
 */
export const voiceStartAction: Omit<PluginAssistantStartAction, "run"> = {
  label: "Start voice mode",
  icon: <AiVoiceModeIcon size={20} />,
};
