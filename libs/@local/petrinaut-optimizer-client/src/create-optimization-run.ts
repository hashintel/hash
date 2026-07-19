import { petrinautOptimizerHttpErrorFromResponse } from "./optimizer-http.js";

import type { PetrinautOptimizerFetch } from "./optimizer-http.js";
import type {
  AbortSignalLike,
  PetrinautOptimizationInput,
} from "@hashintel/petrinaut-core";

/** Configuration for starting one detached Petrinaut Optimizer run. */
export type CreatePetrinautOptimizationRunOptions = {
  /** Base URL (origin) of the Petrinaut Optimizer service. */
  endpoint: string | URL;
  /** Fetch implementation supplied by the current runtime or a test. */
  fetchImpl?: PetrinautOptimizerFetch;
  /** Complete optimization manifest sent to Petrinaut Optimizer. */
  input: PetrinautOptimizationInput;
  /** Correlation id forwarded upstream as the `x-hash-request-id` header. */
  requestId?: string;
  /** Signal used to cancel the request. */
  signal?: AbortSignalLike;
};

/** One admitted detached optimization run. */
export type PetrinautOptimizationRunHandle = {
  /** Identifier used to attach to, re-attach to, and cancel the run. */
  runId: string;
};

/**
 * Start a detached optimization run via `POST /optimize/runs`.
 *
 * The run optimizes in the background with no consumer attached; consume its
 * events with {@link attachPetrinautOptimizationRunStream} and cancel it with
 * {@link cancelPetrinautOptimizationRun}. Non-ok responses throw
 * `PetrinautOptimizerHttpError` carrying the status, `Retry-After`, and any
 * `X-Optimization-Run-ID` header, exactly like the legacy stream opener.
 */
export const createPetrinautOptimizationRun = async ({
  endpoint,
  fetchImpl = fetch,
  input,
  requestId,
  signal,
}: CreatePetrinautOptimizationRunOptions): Promise<PetrinautOptimizationRunHandle> => {
  const response = await fetchImpl(new URL("/optimize/runs", endpoint), {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(requestId === undefined ? {} : { "x-hash-request-id": requestId }),
    },
    body: JSON.stringify(input),
    signal: signal as AbortSignal | undefined,
  });
  if (!response.ok) {
    throw await petrinautOptimizerHttpErrorFromResponse(response);
  }

  let runId: unknown;
  try {
    const payload: unknown = await response.json();
    runId =
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>).run_id
        : undefined;
  } catch {
    runId = undefined;
  }
  if (typeof runId !== "string" || runId.length === 0) {
    throw new Error("Petrinaut optimizer returned an invalid run id");
  }

  return { runId };
};
