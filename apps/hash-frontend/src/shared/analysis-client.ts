import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import type {
  AnalysisInvocation,
  AnalysisResponse,
  AnalysisResult,
  ArtifactRef,
} from "@local/hash-isomorphic-utils/analysis/types";

/**
 * Client for the generic analysis gateway (`POST /api/analysis`). The gateway
 * returns short-lived URLs; artifact bytes are fetched directly from storage
 * (the data plane) rather than proxied through the API.
 */

export class AnalysisError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisError";
  }
}

/** POST a batch of named-analysis invocations and return their results. */
export const runAnalyses = async (
  requests: AnalysisInvocation[],
): Promise<AnalysisResult[]> => {
  const response = await fetch(`${apiOrigin}/api/analysis`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    throw new AnalysisError(
      `Analysis request failed with status ${response.status}`,
    );
  }

  const body = (await response.json()) as AnalysisResponse;
  return body.results;
};

/** Fetch and JSON-parse the bytes referenced by a resolved artifact. */
export const fetchArtifactJson = async <T>(ref: ArtifactRef): Promise<T> => {
  // Presigned (S3) URLs carry auth in the query string and must NOT receive
  // cookies; same-origin (local dev) URLs go through the API and need them.
  const sameOrigin = ref.url.startsWith(apiOrigin);
  const response = await fetch(ref.url, {
    credentials: sameOrigin ? "include" : "omit",
  });

  if (!response.ok) {
    throw new AnalysisError(
      `Artifact "${ref.name}" fetch failed with status ${response.status}`,
    );
  }

  return (await response.json()) as T;
};

const resultReady = (result: AnalysisResult | undefined): AnalysisResult => {
  if (!result) {
    throw new AnalysisError("Empty analysis response");
  }
  if (result.status === "error") {
    throw new AnalysisError(result.error ?? "Analysis returned an error");
  }
  if (result.status !== "ready" || !result.artifacts?.length) {
    throw new AnalysisError(
      `Analysis result not ready (status: ${result.status})`,
    );
  }
  return result;
};

/**
 * Run a single named analysis and return the parsed JSON of one of its
 * artifacts (the primary/first by default, or the named one via `opts.artifact`).
 */
export const fetchAnalysisArtifact = async <T>(
  invocation: Omit<AnalysisInvocation, "id">,
  opts?: { artifact?: string },
): Promise<T> => {
  const [result] = await runAnalyses([{ id: "a0", ...invocation }]);
  const ready = resultReady(result);

  const ref = opts?.artifact
    ? ready.artifacts!.find((a) => a.name === opts.artifact)
    : ready.artifacts![0];

  if (!ref) {
    throw new AnalysisError(
      `Artifact "${opts?.artifact ?? "(primary)"}" not present in result`,
    );
  }

  return fetchArtifactJson<T>(ref);
};

/** Like {@link fetchAnalysisArtifact} but resolves multiple named artifacts at once. */
export const fetchAnalysisArtifacts = async (
  invocation: Omit<AnalysisInvocation, "id">,
): Promise<Record<string, ArtifactRef>> => {
  const [result] = await runAnalyses([{ id: "a0", ...invocation }]);
  const ready = resultReady(result);
  return Object.fromEntries(ready.artifacts!.map((ref) => [ref.name, ref]));
};
