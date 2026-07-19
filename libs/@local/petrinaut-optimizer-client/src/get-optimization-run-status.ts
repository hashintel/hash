import { petrinautOptimizerHttpErrorFromResponse } from "./optimizer-http.js";

import type { PetrinautOptimizerFetch } from "./optimizer-http.js";
import type { AbortSignalLike } from "@hashintel/petrinaut-core";

/** Lifecycle phase reported by the optimizer's status API. */
export type PetrinautOptimizationRunStatusPhase =
  | "idle"
  | "running"
  | "done"
  | "error";

/** One optimization run's reported status. */
export type PetrinautOptimizationRunStatus = {
  /**
   * The run's lifecycle phase. `running` is the only live phase: `done` and
   * `error` are terminal outcomes, and `idle` is what a cancelled or reaped
   * run reports.
   */
  phase: PetrinautOptimizationRunStatusPhase;
  /** Optional human-readable detail accompanying the phase. */
  detail: string | null;
};

/** Configuration for reading one optimization run's status. */
export type GetPetrinautOptimizationRunStatusOptions = {
  /** Base URL (origin) of the Petrinaut Optimizer service. */
  endpoint: string | URL;
  /** Identifier of the run whose status to read. */
  runId: string;
  /** Fetch implementation supplied by the current runtime or a test. */
  fetchImpl?: PetrinautOptimizerFetch;
  /** Correlation id forwarded upstream as the `x-hash-request-id` header. */
  requestId?: string;
  /** Signal used to cancel the request. */
  signal?: AbortSignalLike;
};

/** Return whether an unknown value is a non-array JSON object. */
const isJsonRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Return whether an unknown value is a known run status phase. */
const isPhase = (
  value: unknown,
): value is PetrinautOptimizationRunStatusPhase =>
  value === "idle" ||
  value === "running" ||
  value === "done" ||
  value === "error";

/**
 * Read a run's status via `GET /status/{run_id}`.
 *
 * The status store outlives the run's event log, so this is the cheapest way
 * to check whether a remembered run is still alive without attaching to it.
 * An unknown run throws `PetrinautOptimizerHttpError` with status 404; any
 * other non-ok response throws the same error type.
 */
export const getPetrinautOptimizationRunStatus = async ({
  endpoint,
  runId,
  fetchImpl = fetch,
  requestId,
  signal,
}: GetPetrinautOptimizationRunStatusOptions): Promise<PetrinautOptimizationRunStatus> => {
  const response = await fetchImpl(
    new URL(`/status/${encodeURIComponent(runId)}`, endpoint),
    {
      method: "GET",
      headers: {
        accept: "application/json",
        ...(requestId === undefined ? {} : { "x-hash-request-id": requestId }),
      },
      signal: signal as AbortSignal | undefined,
    },
  );
  if (!response.ok) {
    throw await petrinautOptimizerHttpErrorFromResponse(response);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error("Petrinaut optimizer returned an invalid run status");
  }
  if (!isJsonRecord(payload) || !isPhase(payload.phase)) {
    throw new Error("Petrinaut optimizer returned an invalid run status");
  }

  return {
    phase: payload.phase,
    detail: typeof payload.detail === "string" ? payload.detail : null,
  };
};
