import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";
import { getHASHInternalAPI } from "@local/internal-api-client";

import type { InternalApi } from "@local/internal-api-client";

const basePath = process.env.INTERNAL_API_HOST ?? "http://localhost:5002";

const internalApiKey = process.env.INTERNAL_API_KEY;

if (!isSelfHostedInstance && !internalApiKey) {
  throw new Error("INTERNAL_API_KEY is required");
}

const internalApiFetch: typeof fetch = async (path, init) => {
  if (typeof path !== "string") {
    throw new TypeError("Internal API request path should be a string");
  }

  const headers = new Headers(init?.headers);
  if (internalApiKey) {
    headers.set("internal-api-key", internalApiKey);
  }

  const url = new URL(`${basePath}${path}`);

  const response = await fetch(url, {
    ...init,
    headers,
  }).catch((error: unknown) => {
    throw new Error(
      `Error calling the Internal API: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  });

  if (!response.ok) {
    throw new Error(
      // The pathname leaves out the query, which can hold an email address.
      `Error calling the Internal API: ${url.pathname} responded with ${response.status} ${response.statusText}`,
    );
  }

  return response;
};

export const internalApiClient: InternalApi =
  getHASHInternalAPI(internalApiFetch);
