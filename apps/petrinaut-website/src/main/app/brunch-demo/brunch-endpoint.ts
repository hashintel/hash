import type { BrunchRouteSearch } from "./brunch-search";

type BrunchEndpointResult =
  | { ok: true; endpoint: string; runId?: string }
  | { ok: false; error: string };

const normalizeEndpoint = (value: string, baseUrl: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("Brunch endpoint is empty.");
  }

  const url = /^https?:\/\//u.test(trimmed)
    ? new URL(trimmed)
    : /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/u.test(trimmed)
      ? new URL(`http://${trimmed}`)
      : new URL(trimmed, baseUrl);

  // EventSource throws synchronously on non-HTTP(S) URLs; reject them here so
  // the route renders the friendly status page instead.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Brunch endpoint must use http(s), received "${url.protocol}".`,
    );
  }

  return url.toString();
};

export const getBrunchEndpoint = ({
  baseUrl,
  search,
}: {
  baseUrl: string;
  search: BrunchRouteSearch;
}): BrunchEndpointResult => {
  try {
    if (search.sse !== undefined) {
      return {
        ok: true,
        endpoint: normalizeEndpoint(search.sse, baseUrl),
        runId: search.runId,
      };
    }
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  return {
    ok: false,
    error: "Missing Brunch stream endpoint. Add ?sse=<url>.",
  };
};
