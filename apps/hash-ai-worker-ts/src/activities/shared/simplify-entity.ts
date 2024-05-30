import type { VersionedUrl } from "@blockprotocol/type-system";
import type { EntityId, SimpleEntity } from "@local/hash-graph-types/entity";

type SimplifiedEntity = {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  properties: SimpleEntity["properties"];
  sourceEntityId?: EntityId;
  targetEntityId?: EntityId;
};

/**
 * Simplify the definition of an entity for LLM consumption.
 */
export const simplifyEntity = (entity: SimpleEntity): SimplifiedEntity => ({
  entityId: entity.metadata.recordId.entityId,
  entityTypeId: entity.metadata.entityTypeId,
  /**
   * @todo: consider simplifying property keys
   */
  properties: entity.properties,
  sourceEntityId: entity.linkData?.leftEntityId,
  targetEntityId: entity.linkData?.rightEntityId,
});
