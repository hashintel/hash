/**
 * The Voice plugin's body: while Brunch is the shown assistant it checks the
 * deployment's voice capability, keeps the mediation history per conversation,
 * and returns the voice controls and the caption projection that Petrinaut
 * merges into Brunch's chat. The manifest and the binding are in
 * `../plugin.ts`.
 */

import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { getBrunchVoiceMode } from "../brunch-voice-mode";
import { useVoiceMediationHistory } from "../history/use-voice-mediation-history";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
} from "../session/voice-interview-control";

import type { VoiceManifest } from "../plugin";
import type { PetrinautPluginBody } from "@hashintel/petrinaut/ui";

/** The website's voice configuration route. */
const loadVoiceConfig = (signal: AbortSignal) =>
  loadOpenAIVoiceConfig(globalThis.fetch.bind(globalThis), signal);

const subscribeToNothing = () => () => {};
const readNothing = () => undefined;

export const useVoicePlugin: PetrinautPluginBody<VoiceManifest> = (api) => {
  const brunchShown = api.assistant.isActive;
  const { conversation } = api.deps.brunch;
  const voiceEnabled = api.flags.get("voice");
  const realtimeEnabled = api.flags.get("realtime");

  // The deployment's voice capability: `undefined` while unknown, `null` when
  // it has none. Checked afresh each time Brunch becomes the shown assistant,
  // so nothing from an earlier check applies to a later one.
  const [voiceConfig, setVoiceConfig] = useState<
    OpenAIVoiceConfig | null | undefined
  >(undefined);
  if (!brunchShown && voiceConfig !== undefined) setVoiceConfig(undefined);
  useEffect(() => {
    if (!brunchShown) return;
    const controller = new AbortController();
    void loadVoiceConfig(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) setVoiceConfig(loaded);
    });

    return () => controller.abort();
  }, [brunchShown]);

  // What was said live, per conversation, projected over the transcript as
  // captions. The history is Voice's own store; it follows the server's
  // snapshot of the conversation.
  const mediationHistory = useVoiceMediationHistory(
    conversation?.conversationId ?? null,
  );
  const mapMessagesForDisplay = useSyncExternalStore(
    mediationHistory?.subscribe ?? subscribeToNothing,
    mediationHistory?.getSnapshot ?? readNothing,
    mediationHistory?.getSnapshot ?? readNothing,
  );
  const snapshot = conversation?.snapshot;
  useLayoutEffect(() => {
    if (brunchShown) mediationHistory?.sync(snapshot);
  }, [brunchShown, mediationHistory, snapshot]);

  const renderVoiceMode = getBrunchVoiceMode(
    voiceEnabled && voiceConfig
      ? { ...voiceConfig, provider: realtimeEnabled ? "realtime" : "live" }
      : null,
    conversation?.tracker,
    conversation?.settlements,
    snapshot,
    mediationHistory,
  );

  // Nothing is added until the capability check has answered.
  return {
    assistant: {
      chat:
        brunchShown && voiceConfig !== undefined
          ? {
              ...(renderVoiceMode ? { renderVoiceMode } : {}),
              ...(mapMessagesForDisplay ? { mapMessagesForDisplay } : {}),
            }
          : undefined,
    },
  };
};
