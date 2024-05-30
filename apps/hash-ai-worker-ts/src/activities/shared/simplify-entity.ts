import type { VersionedUrl } from "@blockprotocol/type-system";
import type { SerializedEntity } from "@local/hash-graph-sdk/entity";
import type { EntityId } from "@local/hash-graph-types/entity";

type SimplifiedEntity = {
  entityId: EntityId;
  entityTypeId: VersionedUrl;
  properties: SerializedEntity["properties"];
  sourceEntityId?: EntityId;
  targetEntityId?: EntityId;
};

/**
 * Simplify the definition of an entity for LLM consumption.
 */
export const simplifyEntity = (entity: SerializedEntity): SimplifiedEntity => ({
  entityId: entity.metadata.recordId.entityId,
  entityTypeId: entity.metadata.entityTypeId,
  /**
   * @todo: consider simplifying property keys
   */
  properties: entity.properties,
  sourceEntityId: entity.linkData?.leftEntityId,
  targetEntityId: entity.linkData?.rightEntityId,
});
