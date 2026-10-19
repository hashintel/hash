import {
  deleteOptimizeRun,
  getRunStatus,
  getStatus,
  postOptimizeRuns,
} from "./openapi.gen.js";

import type { PostOptimizeRunsBody } from "./openapi.gen.js";
import type { PetrinautOptimizerFetch } from "./optimizer-http.js";

/**
 * Typed Petrinaut Optimizer client generated from its OpenAPI schema.
 *
 * Covers the plain JSON endpoints (create, cancel, status); the SSE event
 * stream keeps its handwritten adapter in `attach-optimization-run.ts`
 * because the frame protocol is not expressible in OpenAPI. Every call
 * resolves to `{ data, status, headers }`, typed per declared status, and
 * only rejects when the request itself fails — use
 * `petrinautOptimizerHttpErrorFromResult(result)` for throw-style handling
 * with `Retry-After`/`X-Optimization-Run-ID` semantics.
 */
export type PetrinautOptimizerClient = ReturnType<
  typeof createPetrinautOptimizerClient
>;

/** Create a typed client for one optimizer endpoint (path prefixes kept). */
export const createPetrinautOptimizerClient = (
  endpoint: string | URL,
  fetchImpl: PetrinautOptimizerFetch = fetch,
) => {
  const target = (options?: RequestInit) => ({
    ...options,
    endpoint,
    fetchImpl,
  });

  return {
    /** `POST /optimize/runs`: start a detached run. */
    postOptimizeRuns: (body: PostOptimizeRunsBody, options?: RequestInit) =>
      postOptimizeRuns(body, target(options)),
    /** `DELETE /optimize/runs/{run_id}`: cancel a run. */
    deleteOptimizeRun: (runId: string, options?: RequestInit) =>
      deleteOptimizeRun(runId, target(options)),
    /** `GET /status`: every run's status. */
    getStatus: (options?: RequestInit) => getStatus(target(options)),
    /** `GET /status/{run_id}`: one run's status. */
    getRunStatus: (runId: string, options?: RequestInit) =>
      getRunStatus(runId, target(options)),
  };
};
