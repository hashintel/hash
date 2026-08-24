import type { VoiceExperimentEvent } from "./voice-experiment-events";

/**
 * The observable contract shared by the experiment shell.
 *
 * Implementations own their browser audio, provider session, queued playback,
 * and interruption state. `dispose` must be idempotent and must release all of
 * those resources. Provider conversation and tool models stay private to the
 * implementation.
 */
export type VoiceExperimentAdapter = {
  connect(): Promise<void>;
  startTurn(): Promise<void>;
  finishTurn(): Promise<void>;
  dispose(): Promise<void>;
  subscribe(listener: (event: VoiceExperimentEvent) => void): () => void;
};
