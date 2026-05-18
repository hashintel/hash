/**
 * Internal transition state stored in engine and worker frames.
 *
 * Public callers should access this shape through
 * `SimulationFrameReader.getTransitionState()`, not through a separately
 * exported type.
 */
export type SimulationTransitionState = {
  /**
   * Time elapsed since this transition last fired, in milliseconds.
   * Resets to 0 when the transition fires.
   */
  timeSinceLastFiringMs: number;
  /**
   * Whether this transition fired in this specific frame.
   * True only during the frame when the firing occurred.
   */
  firedInThisFrame: boolean;
  /**
   * Total cumulative count of times this transition has fired
   * since the start of the simulation (frame 0).
   */
  firingCount: number;
};
