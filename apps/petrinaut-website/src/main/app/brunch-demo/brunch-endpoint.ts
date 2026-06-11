type BrunchEndpointResult =
  | { ok: true; endpoint: string; runId?: string }
  | { ok: false; error: string };

const normalizeEndpoint = (value: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("Brunch endpoint is empty.");
  }

  const url = /^https?:\/\//u.test(trimmed)
    ? new URL(trimmed)
    : /^(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/u.test(trimmed)
      ? new URL(`http://${trimmed}`)
      : new URL(trimmed, window.location.href);

  // EventSource throws synchronously on non-HTTP(S) URLs; reject them here so
  // the route renders the friendly status page instead.
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `Brunch endpoint must use http(s), received "${url.protocol}".`,
    );
  }

  return url.toString();
};

export const getBrunchEndpointFromLocation = (
  location: Location,
): BrunchEndpointResult => {
  const params = new URLSearchParams(location.search);
  const rawEndpoint = params.get("sse") ?? undefined;

  try {
    if (rawEndpoint !== undefined) {
      return {
        ok: true,
        endpoint: normalizeEndpoint(rawEndpoint),
        runId: params.get("runId") ?? undefined,
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
