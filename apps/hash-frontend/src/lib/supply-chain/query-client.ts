import { apiOrigin } from "@local/hash-isomorphic-utils/environment";

import type {
  ArtifactRef,
  QueryInvocation,
  QueryResponse,
  QueryResult,
} from "@local/hash-isomorphic-utils/query/types";

/**
 * Client for the generic query gateway (`POST /api/query`). The gateway returns
 * short-lived URLs; artifact bytes are fetched directly from storage (the data
 * plane) rather than proxied through the API.
 */

export class QueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QueryError";
  }
}

/** POST a batch of named-query invocations and return their results. */
export const runQueries = async (
  requests: QueryInvocation[],
): Promise<QueryResult[]> => {
  const response = await fetch(`${apiOrigin}/api/query`, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    throw new QueryError(`Query request failed with status ${response.status}`);
  }

  const body = (await response.json()) as QueryResponse;
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
    throw new QueryError(
      `Artifact "${ref.name}" fetch failed with status ${response.status}`,
    );
  }

  return (await response.json()) as T;
};

const resultReady = (result: QueryResult | undefined): QueryResult => {
  if (!result) {
    throw new QueryError("Empty query response");
  }
  if (result.status === "error") {
    throw new QueryError(result.error ?? "Query returned an error");
  }
  if (result.status !== "ready" || !result.artifacts?.length) {
    throw new QueryError(`Query result not ready (status: ${result.status})`);
  }
  return result;
};

/**
 * Run a single named query and return the parsed JSON of one of its artifacts
 * (the primary/first by default, or the named one via `opts.artifact`).
 */
export const fetchQueryArtifact = async <T>(
  invocation: Omit<QueryInvocation, "id">,
  opts?: { artifact?: string },
): Promise<T> => {
  const [result] = await runQueries([{ id: "q0", ...invocation }]);
  const ready = resultReady(result);

  const ref = opts?.artifact
    ? ready.artifacts!.find((a) => a.name === opts.artifact)
    : ready.artifacts![0];

  if (!ref) {
    throw new QueryError(
      `Artifact "${opts?.artifact ?? "(primary)"}" not present in result`,
    );
  }

  return fetchArtifactJson<T>(ref);
};

/** Like {@link fetchQueryArtifact} but resolves multiple named artifacts at once. */
export const fetchQueryArtifacts = async (
  invocation: Omit<QueryInvocation, "id">,
): Promise<Record<string, ArtifactRef>> => {
  const [result] = await runQueries([{ id: "q0", ...invocation }]);
  const ready = resultReady(result);
  return Object.fromEntries(ready.artifacts!.map((ref) => [ref.name, ref]));
};
