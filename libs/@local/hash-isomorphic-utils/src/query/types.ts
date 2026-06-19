import type { WebId } from "@blockprotocol/type-system";

/**
 * Wire types for the generic query gateway (`POST /api/query`).
 *
 * The gateway resolves *named queries* (registered server-side) to one or more
 * stored artifacts and returns short-lived URLs the client fetches directly
 * from storage. The same contract supports a future live-compute path: a result
 * may come back as `computing` rather than `ready` without any client change.
 */

/** A single named-query invocation within a batch request. */
export interface QueryInvocation {
  /** Caller-chosen id used to correlate this invocation with its result. */
  id: string;
  /** Registered query name, e.g. `"productGraph"`. */
  query: string;
  /** Query-specific arguments; validated server-side against the query. */
  args?: Record<string, unknown>;
  /**
   * Web(s) the query is scoped to. The authenticated actor must hold a role in
   * every listed web, otherwise the whole invocation is rejected.
   */
  webIds: WebId[];
}

/** Request body for `POST /api/query`. */
export interface QueryRequest {
  requests: QueryInvocation[];
}

/** A resolved artifact the client can fetch directly from storage. */
export interface ArtifactRef {
  /** Logical name of the artifact within the result, e.g. `"graph"`. */
  name: string;
  /** Wire format/encoding hint, e.g. `"json"` (served with `Content-Encoding`). */
  format: string;
  /** Time-limited URL to fetch the artifact bytes directly from storage. */
  url: string;
  /** Content hash for aggressive client-side caching (optional). */
  contentHash?: string;
  /** ISO timestamp after which `url` may no longer be valid (optional). */
  expiresAt?: string;
}

export type QueryResultStatus = "ready" | "computing" | "error";

/** The result of a single {@link QueryInvocation}. */
export interface QueryResult {
  /** Echoes the invocation `id`. */
  id: string;
  status: QueryResultStatus;
  /** Present when `status === "ready"`. */
  artifacts?: ArtifactRef[];
  /** Present when `status === "computing"`: hint for the client poll interval. */
  retryAfterMs?: number;
  /** Present when `status === "error"`: human-readable reason. */
  error?: string;
}

/** Response body for `POST /api/query`. */
export interface QueryResponse {
  results: QueryResult[];
}
