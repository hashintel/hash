import {
  type VersionedUrl,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

/** Checks the entity type IDs an entity is given, returning why they're invalid. */
export const validateEntityTypeIds = (
  entityTypeIds: VersionedUrl[],
): string | undefined => {
  if (entityTypeIds.length === 0) {
    return "Give at least one entity type ID.";
  }

  for (const entityTypeId of entityTypeIds) {
    if (validateVersionedUrl(entityTypeId).type !== "Ok") {
      return `${JSON.stringify(entityTypeId)} is not an entity type ID.`;
    }
  }

  return undefined;
};
