import type {
  PetrinautAiVoiceSessionPhase,
  PetrinautAiVoiceSessionState,
} from "../../ui/types/ai-assistant-composer-control";

/** Lifecycle actions Petrinaut's own Voice surfaces invoke. */
export type VoiceSessionActions = {
  end: () => void;
  pause: () => void;
  reconnect: () => void;
  resume: () => void;
};

export type VoiceSessionSnapshot = {
  readonly actions: VoiceSessionActions | null;
  /**
   * True while a canvas-level control for the session is mounted, so the
   * assistant panel can leave the same buttons out of its dock.
   */
  readonly hasCanvasControls: boolean;
  readonly state: PetrinautAiVoiceSessionState | null;
};

export type VoiceSessionStore = {
  getSnapshot: () => VoiceSessionSnapshot;
  setActions: (actions: VoiceSessionActions | null) => void;
  setCanvasControlsMounted: (mounted: boolean) => void;
  setState: (state: PetrinautAiVoiceSessionState | null) => void;
  subscribe: (listener: () => void) => () => void;
};

const emptySnapshot: VoiceSessionSnapshot = {
  actions: null,
  hasCanvasControls: false,
  state: null,
};

/**
 * Voice state changes at microphone-sampling rate. Keeping it in an external
 * store rather than React state means only the components that read a given
 * field re-render, instead of everything under a context provider.
 */
export const createVoiceSessionStore = (): VoiceSessionStore => {
  let snapshot = emptySnapshot;
  const listeners = new Set<() => void>();

  const update = (next: VoiceSessionSnapshot) => {
    snapshot = next;
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSnapshot: () => snapshot,
    setActions: (actions) => {
      if (snapshot.actions === actions) {
        return;
      }
      update({ ...snapshot, actions });
    },
    setCanvasControlsMounted: (mounted) => {
      if (snapshot.hasCanvasControls === mounted) {
        return;
      }
      update({ ...snapshot, hasCanvasControls: mounted });
    },
    setState: (state) => {
      if (snapshot.state === null && state === null) {
        return;
      }
      update({ ...snapshot, state });
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
};

export const voiceSessionPhaseOf = (
  snapshot: VoiceSessionSnapshot,
): PetrinautAiVoiceSessionPhase | null => snapshot.state?.phase ?? null;
