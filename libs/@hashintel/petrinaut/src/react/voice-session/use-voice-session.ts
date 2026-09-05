import { use, useCallback, useSyncExternalStore } from "react";

import { VoiceSessionContext } from "./context";

import type { VoiceSessionActions } from "./store";
import type { PetrinautAiVoiceSessionPhase } from "./types";

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

/**
 * Reads the level without subscribing. The indicator samples it once per
 * animation frame, so routing it through React would re-render a component
 * sixty times a second to draw something React never touches.
 */
export const useVoiceSessionMicrophoneLevelReader = (): (() => number) => {
  const store = use(VoiceSessionContext);

  return useCallback(
    () => store.getSnapshot().state?.microphoneLevel ?? 0,
    [store],
  );
};

export const useVoiceSessionMicrophoneMuted = (): boolean => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.microphoneMuted ?? false,
    () => false,
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

export const useVoiceSessionCanReadFullResponse = (): boolean => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.canReadFullResponse ?? false,
    () => false,
  );
};

export const useVoiceSessionCanRepeatQuestion = (): boolean => {
  const store = use(VoiceSessionContext);

  return useSyncExternalStore(
    store.subscribe,
    () => store.getSnapshot().state?.canRepeatQuestion ?? false,
    () => false,
  );
};
