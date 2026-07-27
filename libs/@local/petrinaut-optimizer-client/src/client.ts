import createOpenApiClient from "openapi-fetch";

import type { paths } from "./openapi.gen.js";
import type { PetrinautOptimizerFetch } from "./optimizer-http.js";

/**
 * Typed Petrinaut Optimizer client generated from its OpenAPI schema.
 *
 * Covers the plain JSON endpoints (create, cancel, status); the SSE event
 * stream keeps its handwritten adapter in `attach-optimization-run.ts`
 * because the frame protocol is not expressible in OpenAPI. Non-2xx
 * responses come back as `{ error, response }` — use
 * `petrinautOptimizerHttpErrorFromResponse(response)` for throw-style
 * handling with `Retry-After`/`X-Optimization-Run-ID` semantics.
 */
export type PetrinautOptimizerClient = ReturnType<
  typeof createPetrinautOptimizerClient
>;

/** Create a typed client for one optimizer endpoint (path prefixes kept). */
export const createPetrinautOptimizerClient = (
  endpoint: string | URL,
  fetchImpl?: PetrinautOptimizerFetch,
) =>
  createOpenApiClient<paths>({
    baseUrl: String(endpoint),
    ...(fetchImpl
      ? {
          // openapi-fetch hands over one assembled `Request`; decompose it
          // back into the `(url, init)` shape the injected implementations
          // (and their test fakes) speak.
          fetch: async (request: Request) =>
            fetchImpl(request.url, {
              method: request.method,
              headers: request.headers,
              ...(request.method === "GET" || request.method === "HEAD"
                ? {}
                : { body: await request.text() }),
              signal: request.signal,
            }),
        }
      : {}),
  });
