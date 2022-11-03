import { Entity, EntityType } from "@blockprotocol/graph/.";

export const getEntityLabel = (
  entity: Entity,
  entityType?: EntityType,
): string => {
  return entityType?.schema.labelProperty
    ? String(entity.properties[entityType.schema.labelProperty])
    : entity.entityId;
};
