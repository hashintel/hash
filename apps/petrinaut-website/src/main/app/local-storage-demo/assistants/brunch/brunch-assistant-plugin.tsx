import { useEffect } from "react";

import {
  definePetrinautPlugin,
  usePetrinautActiveAssistantId,
} from "@hashintel/petrinaut/ui";

import { loadOpenAIVoiceConfig } from "../../../voice-interview/voice-interview-control";
import { useDemoAssistantHost } from "../demo-assistant-host";
import { BrunchAssistant, brunchAssistantId } from "./brunch-assistant";
import { BrunchVoiceSetting } from "./brunch-voice-setting";

/**
 * Checks whether this deployment offers Voice each time Brunch becomes the
 * active assistant, and forgets the answer when another assistant takes
 * over. The answer lives with the host, so opening another document, which
 * remounts the editor, keeps it.
 */
const BrunchVoiceCapability = () => {
  const { voice } = useDemoAssistantHost();
  const brunchActive = usePetrinautActiveAssistantId() === brunchAssistantId;
  const { setConfig } = voice;
  const known = voice.config !== undefined;

  useEffect(() => {
    if (!brunchActive) {
      setConfig(undefined);
      return;
    }
    if (known) {
      return;
    }
    const abortController = new AbortController();
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      abortController.signal,
    ).then((config) => {
      if (!abortController.signal.aborted) {
        setConfig(config);
      }
    });
    return () => abortController.abort();
  }, [brunchActive, known, setConfig]);

  return null;
};

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
  component: BrunchVoiceCapability,
  settingsGroups: [
    {
      id: `${brunchAssistantId}.voice`,
      section: "labs",
      title: "Brunch",
      component: BrunchVoiceSettings,
    },
  ],
});
