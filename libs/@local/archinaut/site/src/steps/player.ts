/**
 * A docs page's `Steps` block as plain data: the step it shows, how many it
 * has, and where it is in playing them. It starts `still` on its last step,
 * so a page rendered ahead of time, or read without motion, shows the whole
 * figure. Out of view it rewinds and waits (`armed`); in view it plays one
 * step at a time (`playing`) and stops on the last (`done`), from where it
 * can play again.
 */

export type PlayerPhase = "still" | "armed" | "playing" | "done";

export interface PlayerState {
  step: number;
  count: number;
  phase: PlayerPhase;
}

export const stillPlayer = (count: number): PlayerState => {
  const steps = Math.max(Math.floor(count), 1);
  return { step: steps - 1, count: steps, phase: "still" };
};

/** Rewinds a still block to its first step, ready to play; one step has nothing to play. */
export const armPlayer = (state: PlayerState): PlayerState =>
  state.phase === "still" && state.count > 1
    ? { ...state, step: 0, phase: "armed" }
    : state;

export const startPlayer = (state: PlayerState): PlayerState =>
  state.phase === "armed" ? { ...state, phase: "playing" } : state;

export const advancePlayer = (state: PlayerState): PlayerState => {
  if (state.phase !== "playing") {
    return state;
  }
  const step = state.step + 1;
  return step >= state.count - 1
    ? { ...state, step: state.count - 1, phase: "done" }
    : { ...state, step };
};

/** Advances when the step whose animation finished is still the one shown. */
export const completePlayerStep = (
  state: PlayerState,
  step: number,
): PlayerState => (step === state.step ? advancePlayer(state) : state);

export const replayPlayer = (state: PlayerState): PlayerState =>
  state.count > 1 ? { ...state, step: 0, phase: "playing" } : state;

/** A component inside declared more steps than the compile counted. */
export const registerPlayerSteps = (
  state: PlayerState,
  total: number,
): PlayerState => {
  if (total <= state.count) {
    return state;
  }
  return state.phase === "still"
    ? { ...state, count: total, step: total - 1 }
    : { ...state, count: total };
};
