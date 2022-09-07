import { Entity, EntityType } from "@blockprotocol/graph/.";

export const getEntityLabel = (
  entity: Entity,
  entityType?: EntityType,
): string => {
  const { entityId, properties } = entity;
  const { labelProperty } = entityType?.schema ?? {};
  return labelProperty ? String(properties[labelProperty]) : entityId;
};
