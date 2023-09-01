import { extractBaseUrl } from "@blockprotocol/type-system";
import { EntityType, VersionedUrl } from "@blockprotocol/type-system/dist/cjs";
import {
  EntityTypeWithMetadata,
  fileEntityTypeUrl,
  linkEntityTypeUrl,
} from "@local/hash-subgraph";

export const getParentIds = (
  entityType: Pick<EntityType, "allOf">,
  allEntityTypes: Record<VersionedUrl, EntityTypeWithMetadata>,
): VersionedUrl[] => {
  let parentRefObjects = entityType.allOf ?? [];
  const parentIds = parentRefObjects.map(({ $ref }) => $ref);
  while (parentRefObjects.length) {
    parentRefObjects = parentRefObjects.flatMap(({ $ref }) => {
      const parentEntityType = allEntityTypes[$ref];
      if (!parentEntityType) {
        throw new Error(
          `Entity type ${$ref} not found when looking up ancestors of entity type`,
        );
      }
      return parentEntityType.schema.allOf ?? [];
    });
    parentIds.push(...parentRefObjects.map(({ $ref }) => $ref));
  }
  return parentIds;
};

export const isSpecialEntityType = (
  entityType: Pick<EntityType, "allOf">,
  allEntityTypes: Record<VersionedUrl, EntityTypeWithMetadata>,
): { file: boolean; link: boolean } => {
  const parentIds = getParentIds(entityType, allEntityTypes);

  let isFile = false;
  let isLink = false;

  for (const id of parentIds) {
    if (extractBaseUrl(id) === extractBaseUrl(fileEntityTypeUrl)) {
      isFile = true;
    } else if (extractBaseUrl(id) === extractBaseUrl(linkEntityTypeUrl)) {
      isLink = true;
    }
  }

  return {
    file: isFile,
    link: isLink,
  };
};
