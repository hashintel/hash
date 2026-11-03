/** The local error the adaptive solver allows per step when a run sets none. */
export const DEFAULT_SOLVER_TOLERANCE = 1e-6;

/**
 * How the event-driven engine advances a run between events.
 *
 * - `fixed-step` steps the frame engine at a small fixed step and records
 *   the steps where something fired.
 * - `adaptive` integrates each place's dynamics with an error-controlled
 *   solver and samples firing times from the transitions' rates, so the
 *   step adapts to the dynamics and `tolerance` bounds the local error of
 *   every step, as a fraction of the attribute's magnitude and in absolute
 *   terms near zero.
 */
export type EventSolverConfig =
  | { kind: "fixed-step" }
  | { kind: "adaptive"; tolerance: number };
