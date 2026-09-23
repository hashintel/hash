import {
  definePetrinautPlugin,
  usePetrinautActiveAssistantId,
} from "@hashintel/petrinaut/ui";

import { useDemoAssistantHost } from "../demo-assistant-host";
import { BrunchAssistant, brunchAssistantId } from "./brunch-assistant";
import { BrunchVoiceSetting } from "./brunch-voice-setting";

/** The Brunch Labs group: Voice, which only Brunch conversations offer. */
const BrunchVoiceSettings = () => {
  const { voice } = useDemoAssistantHost();
  const brunchActive = usePetrinautActiveAssistantId() === brunchAssistantId;
  return (
    <BrunchVoiceSetting
      brunchActive={brunchActive}
      openAIVoiceConfig={voice.config}
      setVoiceEnabled={voice.setEnabled}
      voiceEnabled={voice.enabled}
      voicePreferenceReady={voice.ready}
    />
  );
};

/**
 * Brunch as a Petrinaut assistant, with its Voice preference in Labs. The
 * host installs it only where a Brunch endpoint is configured.
 */
export const brunchAssistantPlugin = definePetrinautPlugin({
  id: brunchAssistantId,
  name: "Brunch",
  assistants: [
    { id: brunchAssistantId, label: "Brunch", component: BrunchAssistant },
  ],
  settingsGroups: [
    {
      id: `${brunchAssistantId}.voice`,
      section: "labs",
      title: "Brunch",
      component: BrunchVoiceSettings,
    },
  ],
});
