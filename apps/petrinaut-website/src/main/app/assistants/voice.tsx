/**
 * Voice mode as a Petrinaut plugin. It has no assistant of its own: it
 * requires the Brunch plugin's conversation and registers an input mode on it,
 * so Petrinaut knows nothing about voice and Brunch knows only that another
 * plugin added a mode. Its two Labs flags replace the website's former
 * "Enable Voice" and "Realtime" preferences.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";

import { useStore } from "@hashintel/petrinaut/react";
import {
  definePetrinautPlugin,
  type PetrinautPluginApi,
} from "@hashintel/petrinaut/ui";

import {
  BrunchConversation,
  type BrunchConversationState,
} from "./brunch-conversation";
import { getBrunchVoiceMode } from "./voice/brunch-voice-mode";
import { useVoiceMediationHistory } from "./voice/use-voice-mediation-history";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
} from "./voice/voice-interview-control";

import type { VoiceMediationHistory } from "./voice/voice-mediation-history";

const voiceManifest = {
  id: "website.voice",
  name: "Voice",
  flags: {
    voice: {
      default: true,
      label: "Voice",
      description:
        "Talk to Brunch instead of typing, when the deployment has voice credentials.",
    },
    realtime: {
      default: false,
      label: "Realtime transcription",
      description: "Use the OpenAI Realtime session instead of Live.",
    },
  },
  requires: { brunch: BrunchConversation },
} as const;

type VoiceApi = PetrinautPluginApi<typeof voiceManifest>;

/** How the host loads the voice configuration; the website calls its own API route. */
export interface VoiceHostConfig {
  readonly loadConfig: (
    signal: AbortSignal,
  ) => Promise<OpenAIVoiceConfig | null>;
}

const subscribeToNothing = () => () => {};
const readNothing = () => undefined;

/**
 * Mounted only while Brunch is active, so every activation starts a fresh
 * capability check and nothing from a previous activation can be registered
 * on Brunch in between.
 */
const VoiceSession = ({
  api,
  config,
  conversation,
  mediationHistory,
}: {
  api: VoiceApi;
  config: VoiceHostConfig;
  conversation: BrunchConversationState | null;
  mediationHistory: VoiceMediationHistory | undefined;
}) => {
  const brunch = api.deps.brunch;
  const voiceEnabled = useStore(api.flags.store("voice"));
  const realtimeEnabled = useStore(api.flags.store("realtime"));

  // `undefined` while loading, `null` when the deployment has no voice.
  const [voiceConfig, setVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(undefined);
  useEffect(() => {
    const controller = new AbortController();
    void config.loadConfig(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setVoiceConfig(loaded);
    });
    return () => controller.abort();
  }, [config]);

  // The caption projection of the transcript, kept per conversation.
  const mapMessagesForDisplay = useSyncExternalStore(
    mediationHistory?.subscribe ?? subscribeToNothing,
    mediationHistory?.getSnapshot ?? readNothing,
    mediationHistory?.getSnapshot ?? readNothing,
  );
  useLayoutEffect(() => {
    mediationHistory?.sync(conversation?.snapshot);
  }, [mediationHistory, conversation?.snapshot]);

  const renderVoiceMode = useMemo(
    () =>
      getBrunchVoiceMode(
        voiceEnabled && voiceConfig
          ? {
              ...voiceConfig,
              provider: realtimeEnabled ? "realtime" : "live",
            }
          : null,
        conversation?.tracker,
        conversation?.settlements,
        conversation?.snapshot,
        mediationHistory,
      ),
    [
      conversation,
      mediationHistory,
      realtimeEnabled,
      voiceConfig,
      voiceEnabled,
    ],
  );

  // Register the mode with Brunch once the capability check has answered; a
  // changed mode replaces the previous one, unmounting removes it.
  useEffect(() => {
    if (voiceConfig === undefined) return;
    return brunch.registerInputMode({
      ...(renderVoiceMode ? { renderVoiceMode } : {}),
      ...(mapMessagesForDisplay ? { mapMessagesForDisplay } : {}),
    });
  }, [brunch, mapMessagesForDisplay, renderVoiceMode, voiceConfig]);
  return null;
};

/**
 * Keeps one mediation history per conversation for the page's lifetime and
 * mounts the voice session while Brunch is the active assistant.
 */
const VoiceRoot = ({
  api,
  config,
}: {
  api: VoiceApi;
  config: VoiceHostConfig;
}) => {
  const brunchActive = useStore(api.deps.brunch.active);
  const conversation = useStore(api.deps.brunch.conversation);
  const mediationHistory = useVoiceMediationHistory(
    conversation?.conversationId ?? null,
  );
  return brunchActive ? (
    <VoiceSession
      api={api}
      config={config}
      conversation={conversation}
      mediationHistory={mediationHistory}
    />
  ) : null;
};

export const createVoicePlugin = (config: VoiceHostConfig) =>
  definePetrinautPlugin(voiceManifest, (api) => ({
    root: () => <VoiceRoot api={api} config={config} />,
  }));

/** The website's voice configuration route. */
export const loadVoiceConfigFromApi = (signal: AbortSignal) =>
  loadOpenAIVoiceConfig(globalThis.fetch.bind(globalThis), signal);
