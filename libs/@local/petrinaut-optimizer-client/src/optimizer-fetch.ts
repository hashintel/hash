import { petrinautOptimizerUrl } from "./optimizer-http.js";

import type { PetrinautOptimizerFetch } from "./optimizer-http.js";

// arguments must be optional, because orval requires them to be
export type PetrinautOptimizerRequestInit = RequestInit & {
  endpoint?: string | URL;
  fetchImpl?: PetrinautOptimizerFetch;
};

/**
 * Transport for the orval-generated operations, wired up as the `mutator` in
 * `orval.config.ts`. Resolves the operation's path against the endpoint so
 * its path prefix survives (e.g. a dev proxy under `/api/petrinaut-opt`), and
 * resolves to the `{ data, status, headers }` result orval types per status.
 *
 * Unlike orval's built-in fetch client it never rejects on the body: a body
 * that is not JSON (a proxy's error page, Starlette's plain-text 500) comes
 * back as text, so callers still see the status and headers of the failure.
 */
export const petrinautOptimizerFetch = async <T>(
  path: string,
  { endpoint, fetchImpl = fetch, ...init }: PetrinautOptimizerRequestInit = {},
): Promise<T> => {
  if (endpoint === undefined) {
    throw new TypeError(
      "Petrinaut Optimizer operations must be called through createPetrinautOptimizerClient",
    );
  }

  const response = await fetchImpl(
    petrinautOptimizerUrl(endpoint, path.replace(/^\/+/, "")).href,
    init,
  );
  const text = await response.text();

  let data: unknown = text === "" ? undefined : text;
  if (
    data !== undefined &&
    (response.headers.get("content-type") ?? "").includes("json")
  ) {
    try {
      data = JSON.parse(text);
    } catch {
      // Keep the raw text: a mislabelled body is still worth surfacing.
    }
  }

  return { data, status: response.status, headers: response.headers } as T;
};
