import { use, useSyncExternalStore } from "react";

import { VoiceSessionContext } from "./context";

import type { PetrinautAiVoiceSessionPhase } from "../../ui/types/ai-assistant-composer-control";
import type { VoiceSessionActions } from "./store";

/**
 * Each hook selects a single field so a microphone-level update only
 * re-renders the indicator, not every Voice surface on screen.
 */
export const useVoiceSessionPhase = (): PetrinautAiVoiceSessionPhase | null => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.phase ?? null,
    () => null,
  );
};

export const useVoiceSessionCaption = (): string => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.caption ?? "",
    () => "",
  );
};

export const useVoiceSessionMicrophoneLevel = (): number => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.microphoneLevel ?? 0,
    () => 0,
  );
};

export const useVoiceSessionErrorMessage = (): string | null => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.errorMessage ?? null,
    () => null,
  );
};

export const useVoiceSessionActions = (): VoiceSessionActions | null => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().actions,
    () => null,
  );
};

export const useVoiceSessionHasCanvasControls = (): boolean => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().hasCanvasControls,
    () => false,
  );
};
