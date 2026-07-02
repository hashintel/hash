import type { EntityId } from "@blockprotocol/type-system";

export const FRONTIER_EXPANSION_BATCH_SIZE = 50;

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

export function freshFrontierIds(
  entityIds: readonly EntityId[],
  expanded: ReadonlySet<EntityId>,
  inFlight: ReadonlySet<EntityId>,
): EntityId[] {
  return entityIds.filter(
    (entityId) => !expanded.has(entityId) && !inFlight.has(entityId),
  );
}
