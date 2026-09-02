/**
 * Picks the first backend in a preference order that will take a request.
 *
 * Replaces fallback logic that worked for two backends and had to be edited to
 * gain a third. The caller supplies the order, usually the user's choice first.
 * The walk records every refusal, so a UI can report what was tried.
 *
 * Selection stops at the first backend that both assesses eligible *and*
 * instantiates, because the two can disagree: a net can be perfectly runnable
 * and the device still be out of memory. Treating instantiation failure as a
 * refusal keeps the fallback honest instead of surfacing a dead end.
 */
import type { MonteCarloExperiment } from "../simulation/monte-carlo/runtime/experiment";
import type {
  ExperimentNote,
  InstantiateExperimentOptions,
} from "./experiment-assessment";
import type {
  ExperimentBackend,
  ExperimentBackendRegistration,
  ExperimentSelectionFailure,
} from "./experiment-backend";
import type { ExperimentRequest } from "./experiment-request";

export type SelectExperimentBackendInput = {
  /**
   * Candidates in preference order, best first.
   *
   * The caller orders these, usually the user's requested backend followed by
   * the fallbacks, because preference is a product decision, not something this
   * function should infer.
   */
  readonly registrations: readonly ExperimentBackendRegistration[];
  /**
   * Builds the request for a backend, given whether that backend needs HIR trees.
   *
   * A function rather than a value because compiling artifacts is expensive and
   * the two backends want different ones: asking for trees unconditionally would
   * triple artifact size for the worker-pool path, which never reads them.
   * Called at most once per distinct `needsHirTrees` value.
   */
  buildRequest(
    this: void,
    options: { needsHirTrees: boolean },
  ): Promise<ExperimentRequest>;
  readonly instantiateOptions?: InstantiateExperimentOptions;
};

export type SelectExperimentBackendResult =
  | {
      readonly ok: true;
      readonly backendId: string;
      readonly handle: MonteCarloExperiment;
      readonly runtimeInfo?: string;
      readonly notes: readonly ExperimentNote[];
      /**
       * Backends declined before this one, in the order they were tried.
       *
       * Empty when the first choice was used. Non-empty means the run is not on
       * the backend the user asked for, which is worth telling them.
       */
      readonly declined: readonly ExperimentSelectionFailure[];
    }
  | {
      readonly ok: false;
      readonly declined: readonly ExperimentSelectionFailure[];
    };

/** Summarises blockers into one sentence, leading with the most actionable. */
function summarize(
  blockers: readonly {
    message: string;
    origin: ExperimentSelectionFailure["origin"];
  }[],
): { origin: ExperimentSelectionFailure["origin"]; reason: string } {
  // `model` first: it names something the author can change. An emitter's own
  // message describes an expression tree and helps nobody choose what to edit.
  const order: ExperimentSelectionFailure["origin"][] = [
    "model",
    "configuration",
    "capacity",
    "environment",
  ];
  const sorted = [...blockers].sort(
    (left, right) => order.indexOf(left.origin) - order.indexOf(right.origin),
  );
  const [first] = sorted;
  if (!first) {
    // Unreachable through `ExperimentBlockers`, which is a non-empty tuple. Kept
    // because this helper also takes plain arrays from instantiation results.
    return { origin: "environment", reason: "declined without a reason" };
  }
  const others = sorted.length > 1 ? ` (+${sorted.length - 1} more)` : "";
  return { origin: first.origin, reason: `${first.message}${others}` };
}

/** The engine marks cancellation by renaming an `Error` to `AbortError`. */
const isAbortError = (error: unknown): boolean =>
  error instanceof Error && error.name === "AbortError";

export async function selectExperimentBackend({
  registrations,
  buildRequest,
  instantiateOptions,
}: SelectExperimentBackendInput): Promise<SelectExperimentBackendResult> {
  const declined: ExperimentSelectionFailure[] = [];
  // Memoised per `needsHirTrees`, so two backends wanting the same artifacts
  // compile them once.
  const requests = new Map<boolean, Promise<ExperimentRequest>>();
  const requestFor = (needsHirTrees: boolean) => {
    const existing = requests.get(needsHirTrees);
    if (existing) {
      return existing;
    }
    const created = buildRequest({ needsHirTrees });
    requests.set(needsHirTrees, created);
    return created;
  };

  for (const registration of registrations) {
    let backend: ExperimentBackend;
    try {
      backend = await registration.load();
    } catch (error) {
      // A backend whose module fails to load is an environment problem, not a
      // reason to abandon the experiment.
      declined.push({
        backendId: registration.id,
        origin: "environment",
        reason: `${registration.label} could not be loaded: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }

    if (!backend.isAvailable()) {
      declined.push({
        backendId: backend.id,
        origin: "environment",
        reason: `${backend.label} is not available in this environment.`,
      });
      continue;
    }

    // A cancelled experiment must not fall through to the next candidate and
    // spin up work the user already abandoned.
    if (instantiateOptions?.signal?.aborted) {
      const abort = new Error(
        "The experiment was cancelled before a backend was selected.",
      );
      abort.name = "AbortError";
      throw abort;
    }

    // A backend that throws — instead of returning a refusal — must not
    // abandon the walk: the next candidate may run the request fine, and the
    // module's own contract says instantiation failure is a refusal. Aborts
    // are the exception: they are the caller's cancellation, not a refusal.
    let assessment;
    try {
      assessment = await backend.assess(
        await requestFor(backend.needsHirTrees),
      );
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      declined.push({
        backendId: backend.id,
        origin: "environment",
        reason: `${backend.label} failed while assessing the request: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }
    if (!assessment.eligible) {
      declined.push({
        backendId: backend.id,
        ...summarize(assessment.blockers),
      });
      continue;
    }

    let instantiated;
    try {
      instantiated = await assessment.instantiate(instantiateOptions);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      declined.push({
        backendId: backend.id,
        origin: "environment",
        reason: `${backend.label} failed while instantiating: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
      continue;
    }
    if (!instantiated.ok) {
      declined.push({
        backendId: backend.id,
        ...summarize(instantiated.blockers),
      });
      continue;
    }

    return {
      ok: true,
      backendId: backend.id,
      handle: instantiated.handle,
      ...(instantiated.runtimeInfo === undefined
        ? {}
        : { runtimeInfo: instantiated.runtimeInfo }),
      notes: assessment.notes,
      declined,
    };
  }

  return { ok: false, declined };
}
