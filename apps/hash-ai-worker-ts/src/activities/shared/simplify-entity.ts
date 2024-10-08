import type { VersionedUrl } from "@blockprotocol/type-system";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";

type SimplifiedEntity = {
  entityId: EntityId;
  entityTypeIds: [VersionedUrl, ...VersionedUrl[]];
  properties: Entity["properties"];
  sourceEntityId?: EntityId;
  targetEntityId?: EntityId;
};

/**
 * Simplify the definition of an entity for LLM consumption.
 *
 * @todo consolidate with simplifyProposedEntityForLlmConsumption
 */
export const simplifyEntity = (entity: Entity): SimplifiedEntity => ({
  entityId: entity.metadata.recordId.entityId,
  entityTypeIds: entity.metadata.entityTypeIds,
  /**
   * @todo: consider simplifying property keys
   */
  properties: entity.properties,
  sourceEntityId: entity.linkData?.leftEntityId,
  targetEntityId: entity.linkData?.rightEntityId,
});
