type BrunchEndpointResult =
  | { ok: true; endpoint: string; runId?: string }
  | { ok: false; error: string };

const normalizeEndpoint = (value: string): string => {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    throw new Error("Brunch endpoint is empty.");
  }

  if (/^https?:\/\//u.test(trimmed)) {
    return new URL(trimmed).toString();
  }

  if (/^(localhost|127\.0\.0\.1|\[::1\])(?::|\/)/u.test(trimmed)) {
    return new URL(`http://${trimmed}`).toString();
  }

  return new URL(trimmed, window.location.href).toString();
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
