import type { JsonObject } from "@blockprotocol/core";
import type { WebId } from "@blockprotocol/type-system";

/**
 * Wire types for the generic analysis gateway (`POST /api/analysis`).
 *
 * The gateway resolves *named analyses* (registered server-side) to one or more
 * stored artifacts and returns short-lived URLs the client fetches directly
 * from storage. The same contract supports a future live-compute path: a result
 * may come back as `computing` rather than `ready` without any client change.
 */

/** A single named-analysis invocation within a batch request. */
export interface AnalysisInvocation {
  /** Caller-chosen id used to correlate this invocation with its result. */
  id: string;
  /** Registered analysis name, e.g. `"productGraph"`. */
  analysis: string;
  /** Analysis-specific arguments; validated server-side against the analysis. */
  args?: Record<string, unknown>;
  /**
   * Web the analysis is scoped to. The authenticated actor must hold a role in
   * this web, otherwise the invocation is rejected. Batch multiple invocations
   * to target several webs in one request.
   */
  webId: WebId;
}

/** Request body for `POST /api/analysis`. */
export interface AnalysisRequest {
  requests: AnalysisInvocation[];
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

export type AnalysisResultStatus = "ready" | "computing" | "error";

/** The result of a single {@link AnalysisInvocation}. */
export interface AnalysisResult {
  /** Echoes the invocation `id`. */
  id: string;
  status: AnalysisResultStatus;
  /** Present when `status === "ready"`. */
  artifacts?: ArtifactRef[];
  /** Present when `status === "computing"`: hint for the client poll interval. */
  retryAfterMs?: number;
  /** Analysis-specific JSON metadata which does not require artifact access. */
  metadata?: JsonObject;
  /** Present when `status === "error"`: human-readable reason. */
  error?: string;
}

/** Response body for `POST /api/analysis`. */
export interface AnalysisResponse {
  results: AnalysisResult[];
}
