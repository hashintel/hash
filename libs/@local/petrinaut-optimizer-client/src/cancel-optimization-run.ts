import { petrinautOptimizerHttpErrorFromResponse } from "./optimizer-http.js";

import type { PetrinautOptimizerFetch } from "./optimizer-http.js";
import type { AbortSignalLike } from "@hashintel/petrinaut-core";

/** Configuration for cancelling one detached Petrinaut Optimizer run. */
export type CancelPetrinautOptimizationRunOptions = {
  /** Base URL (origin) of the Petrinaut Optimizer service. */
  endpoint: string | URL;
  /** Identifier of the detached run to cancel. */
  runId: string;
  /** Fetch implementation supplied by the current runtime or a test. */
  fetchImpl?: PetrinautOptimizerFetch;
  /** Correlation id forwarded upstream as the `x-hash-request-id` header. */
  requestId?: string;
  /** Signal used to cancel the request. */
  signal?: AbortSignalLike;
};

/**
 * Cancel a detached optimization run via `DELETE /optimize/runs/{run_id}`.
 *
 * Cancellation is idempotent from the caller's point of view: an upstream
 * `204` (cancelled, or already terminal) and an upstream `404` (unknown or
 * already expired) both resolve, because in every one of those states the run
 * is no longer consuming optimizer resources. Any other non-ok response
 * throws `PetrinautOptimizerHttpError`.
 */
export const cancelPetrinautOptimizationRun = async ({
  endpoint,
  runId,
  fetchImpl = fetch,
  requestId,
  signal,
}: CancelPetrinautOptimizationRunOptions): Promise<void> => {
  const response = await fetchImpl(
    new URL(`/optimize/runs/${encodeURIComponent(runId)}`, endpoint),
    {
      method: "DELETE",
      headers: {
        ...(requestId === undefined ? {} : { "x-hash-request-id": requestId }),
      },
      signal: signal as AbortSignal | undefined,
    },
  );
  if (!response.ok && response.status !== 404) {
    throw await petrinautOptimizerHttpErrorFromResponse(response);
  }
};
