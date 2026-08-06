import {
  attachPetrinautOptimizationRunStream,
  createPetrinautOptimizerClient,
  PetrinautOptimizerHttpError,
  petrinautOptimizerHttpErrorFromResponse,
} from "@local/petrinaut-optimizer-client";

import type {
  PetrinautOptimization,
  PetrinautOptimizationEvent,
} from "@hashintel/petrinaut-core";
import type { PetrinautOptimizerFetch } from "@local/petrinaut-optimizer-client";

/**
 * Dev-proxy base for the local Petrinaut Optimizer: `vite.config.ts` rewrites
 * `/api/petrinaut-opt/*` to the Python service. Resolved against the current
 * document at call time; the client's URL builder keeps the path prefix.
 */
const petrinautOptEndpoint = (): URL =>
  new URL(
    "/api/petrinaut-opt/",
    // Tests run without a DOM; the browser always resolves from the page.
    typeof location === "undefined" ? "http://localhost/" : location.href,
  );

/**
 * Stamp the duck-typed classification fields Petrinaut's optimization
 * provider reads (`category`, `httpStatus`, `retryAfter`) onto the client's
 * HTTP error, so e.g. a 404 on re-attaching to an expired run silently drops
 * the record instead of surfacing a raw error message.
 */
const classifyHttpError = (error: unknown): unknown =>
  error instanceof PetrinautOptimizerHttpError
    ? Object.assign(error, {
        category: "http",
        httpStatus: error.status,
        ...(error.retryAfter === null
          ? {}
          : { retryAfter: Number.parseInt(error.retryAfter, 10) }),
      })
    : error;

/**
 * Classify a mid-stream failure so the provider reconnects with its cursor
 * instead of failing the run on the first dropped connection. Aborts pass
 * through untouched. A response body that dies mid-stream rejects the reader
 * with a `TypeError`, which is a transport failure rather than a malformed
 * frame — the remaining non-abort errors are the decoder's own validation
 * failures, which stay `protocol`.
 */
const classifyStreamError = (error: unknown): unknown =>
  error instanceof Error && error.name !== "AbortError"
    ? Object.assign(error, {
        category: error instanceof TypeError ? "network" : "protocol",
      })
    : error;

/**
 * Classify a request-time failure: HTTP errors keep their status semantics,
 * and anything else non-abort (a fetch `TypeError` from a dropped
 * connection) is `network` — so an attach that dies before responding
 * reconnects with backoff exactly like a mid-stream drop, instead of
 * definitively failing a possibly-live run.
 */
const classifyRequestError = (error: unknown): unknown =>
  error instanceof PetrinautOptimizerHttpError
    ? classifyHttpError(error)
    : error instanceof Error && error.name !== "AbortError"
      ? Object.assign(error, { category: "network" })
      : error;

/** Create the local-only Petrinaut capability backed directly by Python. */
export const createPetrinautOptOptimization = (
  fetchImpl: PetrinautOptimizerFetch = fetch,
): PetrinautOptimization => {
  const client = createPetrinautOptimizerClient(
    petrinautOptEndpoint(),
    fetchImpl,
  );
  // openapi-fetch names its verb methods in caps; alias them so call sites
  // don't read as constructor calls (oxlint's new-cap).
  const { DELETE: deleteRun, POST: postRun } = client;

  return {
    async createOptimizationRun(input, options) {
      const created = await postRun("/optimize/runs", {
        body: input,
        ...(options?.signal ? { signal: options.signal as AbortSignal } : {}),
      }).catch((error: unknown) => {
        throw classifyRequestError(error);
      });
      if (!created.response.ok || !created.data?.run_id) {
        throw classifyHttpError(
          await petrinautOptimizerHttpErrorFromResponse(created.response),
        );
      }
      return { runId: created.data.run_id };
    },
    async *attachOptimizationRun(runId, options) {
      let events: AsyncIterable<PetrinautOptimizationEvent>;
      try {
        ({ events } = await attachPetrinautOptimizationRunStream({
          endpoint: petrinautOptEndpoint(),
          fetchImpl,
          runId,
          ...(options?.cursor === undefined ? {} : { cursor: options.cursor }),
          ...(options?.signal ? { signal: options.signal } : {}),
        }));
      } catch (error) {
        throw classifyRequestError(error);
      }
      options?.onAttached?.();
      try {
        yield* events;
      } catch (error) {
        throw classifyStreamError(error);
      }
    },
    async cancelOptimizationRun(runId) {
      await deleteRun("/optimize/runs/{run_id}", {
        params: { path: { run_id: runId } },
      });
    },
  };
};
