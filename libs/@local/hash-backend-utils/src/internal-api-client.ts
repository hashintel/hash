import { isSelfHostedInstance } from "@local/hash-isomorphic-utils/instance";

const basePath = process.env.INTERNAL_API_HOST ?? "http://localhost:5002";

const internalApiKey = process.env.INTERNAL_API_KEY;

if (!isSelfHostedInstance && !internalApiKey) {
  throw new Error("INTERNAL_API_KEY is required");
}

export type WebSearchResult = {
  title: string;
  url: string;
  position: number;
};

const get = async <T>(
  path: string,
  query: Record<string, string>,
): Promise<T> => {
  const url = new URL(`${basePath}${path}`);
  url.search = new URLSearchParams(query).toString();

  const response = await fetch(url, {
    headers: internalApiKey ? { "internal-api-key": internalApiKey } : {},
  }).catch((error: unknown) => {
    throw new Error(
      `Error calling the Internal API: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  });

  if (!response.ok) {
    throw new Error(
      `Error calling the Internal API: ${path} responded with ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as T;
};

export const internalApiClient = {
  getWaitlistPosition: (email: string) =>
    get<{ waitlistPosition: number | null }>("/waitlist-position", { email }),
  getWebSearchResults: (query: string) =>
    get<{ webSearchResults: WebSearchResult[] }>("/web-search-results", {
      query,
    }),
};
