import {
  useEffect,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
} from "react";

import { useVoiceMediationHistory } from "../history/use-voice-mediation-history";
import {
  loadOpenAIVoiceConfig,
  type OpenAIVoiceConfig,
} from "../session/voice-interview-control";
import { getBrunchVoiceMode } from "./brunch-voice-mode";

import type { BrunchConversation } from "../../brunch/definition";
import type { VoiceService } from "../definition";

const subscribeToNothing = () => () => {};
const readNothing = () => undefined;

/**
 * Voice for Brunch's conversation: while Brunch is shown it checks the
 * deployment's voice capability, keeps what was said live per conversation,
 * and returns the voice mode and the captions Brunch's chat reads.
 */
export const useBrunchVoice = ({
  shown,
  conversation,
  enabled,
  realtime,
}: {
  /** Whether Brunch is the shown assistant. */
  shown: boolean;
  conversation: BrunchConversation | null;
  /** The user's Voice setting. */
  enabled: boolean;
  /** The user's Realtime setting: the OpenAI Realtime session instead of Live. */
  realtime: boolean;
}): { readonly available: boolean; readonly chat: VoiceService } => {
  // `undefined` while unknown, `null` when the deployment has no voice.
  // Checked afresh each time Brunch is shown, so an earlier answer never
  // applies to a later check.
  const [config, setConfig] = useState<OpenAIVoiceConfig | null | undefined>(
    undefined,
  );
  if (!shown && config !== undefined) setConfig(undefined);
  useEffect(() => {
    if (!shown) return;
    const controller = new AbortController();
    void loadOpenAIVoiceConfig(
      globalThis.fetch.bind(globalThis),
      controller.signal,
    ).then((loaded) => {
      if (!controller.signal.aborted) setConfig(loaded);
    });
    return () => controller.abort();
  }, [shown]);

  // What was said live, projected over the transcript as captions.
  const mediationHistory = useVoiceMediationHistory(
    conversation?.conversationId ?? null,
  );
  const mapMessagesForDisplay = useSyncExternalStore(
    mediationHistory?.subscribe ?? subscribeToNothing,
    mediationHistory?.getSnapshot ?? readNothing,
  );
  const snapshot = conversation?.snapshot;
  useLayoutEffect(() => {
    mediationHistory?.sync(snapshot);
  }, [mediationHistory, snapshot]);

  const renderVoiceMode = getBrunchVoiceMode(
    enabled && config
      ? { ...config, provider: realtime ? "realtime" : "live" }
      : null,
    conversation?.tracker,
    conversation?.settlements,
    snapshot,
    mediationHistory,
    conversation?.toolApprovalState,
  );

  return {
    available: renderVoiceMode !== undefined,
    chat: { renderVoiceMode, mapMessagesForDisplay },
  };
};
