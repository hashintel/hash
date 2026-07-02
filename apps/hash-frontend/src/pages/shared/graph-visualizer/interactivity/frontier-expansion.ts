/**
 * Batching and dedup helpers for expanding a frontier: splitting a large id set into
 * GraphQL-sized requests, and filtering out ids already resolved or already in flight.
 */
import type { EntityId } from "@blockprotocol/type-system";

/**
 * Max entity ids per GraphQL expansion request.
 *
 * @defaultValue 50. Raise for fewer round trips; lower to reduce payload size and
 * timeout risk.
 */
export const FRONTIER_EXPANSION_BATCH_SIZE = 50;

/**
 * Splits a frontier id set into consecutive chunks of at most
 * {@link FRONTIER_EXPANSION_BATCH_SIZE}, preserving input order.
 */
export function frontierExpansionBatches(
  entityIds: readonly EntityId[],
): EntityId[][] {
  const batches: EntityId[][] = [];
  for (
    let start = 0;
    start < entityIds.length;
    start += FRONTIER_EXPANSION_BATCH_SIZE
  ) {
    batches.push(entityIds.slice(start, start + FRONTIER_EXPANSION_BATCH_SIZE));
  }
  return batches;
}

/**
 * Filters `entityIds` down to those neither already expanded nor already being
 * fetched, so a repeated expansion request does not re-fetch or double-fetch a node.
 */
export function freshFrontierIds(
  entityIds: readonly EntityId[],
  expanded: ReadonlySet<EntityId>,
  inFlight: ReadonlySet<EntityId>,
): EntityId[] {
  return entityIds.filter(
    (entityId) => !expanded.has(entityId) && !inFlight.has(entityId),
  );
}
