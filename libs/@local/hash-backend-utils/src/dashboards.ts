/**
 * Shared helpers for server-side dashboard item data computation.
 *
 * Dashboard item chart data is computed server-side (graph query + Python
 * transformation) and cached as an analysis artifact in storage. The artifact
 * key is derived from a hash of the item's configuration (structural query +
 * Python script), so any configuration change automatically invalidates the
 * cached artifact.
 *
 * These helpers are used by both `hash-api` (the analysis gateway, which
 * resolves/serves artifacts and requests recomputation) and
 * `hash-ai-worker-ts` (which computes and writes artifacts), so the key and
 * hash derivation must stay in sync — hence this shared module.
 */
import { createHash } from "node:crypto";

import type { ActorEntityUuid, WebId } from "@blockprotocol/type-system";

/**
 * Deterministically stringify a JSON value, sorting object keys recursively.
 *
 * The structural query is stored as a JSONB object in the graph, which does
 * not preserve key order, so a plain `JSON.stringify` of the round-tripped
 * object may differ from the originally-generated JSON. Sorting keys makes
 * the hash independent of key order.
 */
const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entryValue]) => entryValue !== undefined)
    .sort(([keyA], [keyB]) => (keyA < keyB ? -1 : 1));

  return `{${entries
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${stableStringify(entryValue)}`,
    )
    .join(",")}}`;
};

/**
 * Hash of a dashboard item's data-producing configuration. Items with the
 * same query and script produce the same hash (and therefore share a cached
 * artifact); any change to either produces a new hash.
 */
export const generateDashboardItemConfigHash = (params: {
  /** The structural query, as stored on the entity (a parsed Filter object) */
  structuralQuery: unknown;
  pythonScript: string;
}): string =>
  createHash("sha256")
    .update(stableStringify(params.structuralQuery))
    .update("\u0000")
    .update(params.pythonScript)
    .digest("hex");

/**
 * Storage key for a dashboard item's computed chart data artifact.
 *
 * Must satisfy the analysis gateway's web-scoping invariant:
 * `analysis/{webId}/...` (see `isWebScopedKeyForWeb` in hash-api).
 */
export const getDashboardItemDataStorageKey = (params: {
  webId: WebId;
  configHash: string;
}): string => `analysis/${params.webId}/dashboards/${params.configHash}.json`;

/** Name of the Temporal workflow (on the "ai" task queue) that computes dashboard item data. */
export const COMPUTE_DASHBOARD_ITEM_DATA_WORKFLOW = "computeDashboardItemData";

export type ComputeDashboardItemDataWorkflowParams = {
  authentication: { actorId: ActorEntityUuid };
  webId: WebId;
  /** The structural query filter, as a JSON string */
  structuralQuery: string;
  /** The Python data-transformation script */
  pythonScript: string;
  /** The (analysis-scoped) storage key to write the resulting artifact to */
  storageKey: string;
};

export type ComputeDashboardItemDataWorkflowResult = {
  /** Number of items in the computed chart data array */
  itemCount: number;
  storageKey: string;
};
