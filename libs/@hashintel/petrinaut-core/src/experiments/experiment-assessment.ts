/**
 * A backend's answer to "can you run this request, and if not, why?"
 *
 * Refusal is a value, not an exception, because a backend may be a **subset**
 * engine: declining a net is ordinary operation, the caller's response is to try
 * another backend, and the reason has to reach the user. Modelling that as a
 * thrown error would make the normal path the exceptional one.
 *
 * The refusal carries structured blockers rather than a single string, so a UI
 * can attribute a problem to the item that caused it and report several at once.
 * A `reason: string` contract would collapse that at the abstraction boundary,
 * and it cannot be widened later without changing every backend.
 */
import type { AbortSignalLike } from "../environment";
import type { MonteCarloExperiment } from "../simulation/monte-carlo/runtime/experiment";

/**
 * Where a problem lives, and therefore who can act on it.
 *
 * This is the field a UI branches on, and the reason a blocker is worth more
 * than a message:
 *
 * - `model` — the net must change. Attribute it to `itemId` and keep the backend
 *   offered but unavailable, because editing the net can fix it.
 * - `configuration` — the *experiment* must change: run count, initial marking,
 *   metric shapes, missing artifacts. Actionable where the experiment is set up,
 *   not by editing the net.
 * - `environment` — this browser or machine cannot do it at all. Do not blame the
 *   net and do not nag; hiding the option is reasonable.
 * - `capacity` — the backend could normally do this but cannot right now: a full
 *   queue, a device out of memory. Distinct from `environment` precisely because
 *   it is transient, so "retry" or "use fewer runs" is the right advice where
 *   "hide the option" would be wrong.
 */
export type ExperimentBlockerOrigin =
  | "model"
  | "configuration"
  | "environment"
  | "capacity";

export type ExperimentBlocker = {
  /**
   * Stable, backend-namespaced code, for tests and for grouping in a UI.
   *
   * Intentionally `string` rather than a closed union: a union shared across
   * backends could not be extended by a lazily loaded or third-party backend
   * without editing this file.
   */
  readonly code: string;
  /** Written for whoever authored the net, not for whoever wrote the emitter. */
  readonly message: string;
  readonly origin: ExperimentBlockerOrigin;
  /** The net item responsible, when one can be identified. */
  readonly itemId?: string;
};

/** Something the user should know that did not prevent the run. */
export type ExperimentNote = {
  readonly code: string;
  readonly message: string;
};

/** At least one, so a refusal without a reason cannot be constructed. */
export type ExperimentBlockers = readonly [
  ExperimentBlocker,
  ...ExperimentBlocker[],
];

/**
 * The non-serializable half of starting an experiment.
 *
 * Separate from `ExperimentRequest` so the request stays plain data. Both of
 * these are host-side wiring: a signal is a live object, and notes are delivered
 * by calling back.
 */
export type InstantiateExperimentOptions = {
  signal?: AbortSignalLike;
  /**
   * Receives problems that only become detectable once the run is under way —
   * today, a metric histogram whose top bin saturated.
   *
   * The notes on the assessment are assembled before anything runs and cannot
   * carry these. Without a channel for them the results would be presented as
   * fact.
   */
  onNote?: (note: ExperimentNote) => void;
};

export type ExperimentInstantiation =
  | {
      readonly ok: true;
      readonly handle: MonteCarloExperiment;
      /**
       * Where this actually ran, for the record: a GPU adapter description, a
       * shard count, a server region. Free text because only a human reads it.
       */
      readonly runtimeInfo?: string;
    }
  | { readonly ok: false; readonly blockers: ExperimentBlockers };

export type ExperimentAssessment =
  | {
      readonly eligible: true;
      /** Non-blocking observations to surface before the run. */
      readonly notes: readonly ExperimentNote[];
      /**
       * Starts the experiment that was assessed.
       *
       * A closure rather than a second call taking the request again, so the work
       * already done — a compiled shader, a shard plan — carries forward and the
       * verdict and the run can never be about different things.
       *
       * May still fail, but only for `environment` or `capacity` reasons: whether
       * the *net and configuration* are runnable was settled by the assessment.
       * The split exists so that assessing a net while the user edits — to decide
       * what to offer — never acquires a device or a worker pool.
       */
      instantiate(
        this: void,
        options?: InstantiateExperimentOptions,
      ): Promise<ExperimentInstantiation>;
    }
  | { readonly eligible: false; readonly blockers: ExperimentBlockers };
