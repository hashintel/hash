import type { SimulationFrame } from "../types/simulation";

/**
 * Result of checking transition enablement for a simulation frame.
 */
export type TransitionEnablementResult = {
  /**
   * Whether at least one transition has its input token requirements satisfied.
   * If false, the simulation is in a terminal state (deadlock).
   */
  hasEnabledTransition: boolean;

  /**
   * Map from transition ID to whether that transition has sufficient input tokens.
   */
  transitionStatus: Map<string, boolean>;
};

/**
 * Checks if a single transition has its input token requirements satisfied.
 *
 * A transition is structurally enabled when all its input places have at least
 * as many tokens as required by their respective arc weights.
 *
 * Note: This only checks token counts, not lambda conditions. A transition may
 * be structurally enabled but still not fire due to lambda returning 0 or false.
 *
 * @param frame - The current simulation frame
 * @param transitionId - The ID of the transition to check
 * @returns true if the transition has sufficient input tokens, false otherwise
 */
export const isTransitionStructurallyEnabled = (
  frame: SimulationFrame,
  transitionId: string,
): boolean => {
  const transition = frame.transitions.get(transitionId);
  if (!transition) {
    throw new Error(`Transition with ID ${transitionId} not found.`);
  }

  // Check if all input places have enough tokens for the required arc weights
  return transition.instance.inputArcs.every((arc) => {
    const placeState = frame.places.get(arc.placeId);
    if (!placeState) {
      throw new Error(
        `Place with ID ${arc.placeId} not found in current marking.`,
      );
    }

    return placeState.count >= arc.weight;
  });
};

/**
 * Checks if the simulation has reached a terminal state (deadlock) where no
 * transitions can fire due to insufficient tokens.
 *
 * This function only checks the structural enablement of transitions based on
 * token counts. It does not evaluate lambda functions, so a transition that is
 * structurally enabled may still not fire if its lambda condition prevents it.
 *
 * Use this function after a frame where no transitions fired to determine if
 * the simulation has definitively reached a terminal state.
 *
 * @param frame - The current simulation frame to check
 * @returns A result object containing:
 *   - `hasEnabledTransition`: Whether at least one transition could potentially fire
 *   - `transitionStatus`: Map showing which transitions are structurally enabled
 *
 * @example
 * ```ts
 * const result = checkTransitionEnablement(currentFrame);
 * if (!result.hasEnabledTransition) {
 *   console.log("Simulation reached a terminal state (deadlock)");
 * }
 * ```
 */
export const checkTransitionEnablement = (
  frame: SimulationFrame,
): TransitionEnablementResult => {
  const transitionStatus = new Map<string, boolean>();
  let hasEnabledTransition = false;

  for (const [transitionId] of frame.transitions) {
    const isEnabled = isTransitionStructurallyEnabled(frame, transitionId);
    transitionStatus.set(transitionId, isEnabled);

    if (isEnabled) {
      hasEnabledTransition = true;
    }
  }

  return {
    hasEnabledTransition,
    transitionStatus,
  };
};
