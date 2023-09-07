import { extractBaseUrl } from "@blockprotocol/type-system";
import { EntityType, VersionedUrl } from "@blockprotocol/type-system/dist/cjs";
import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  EntityTypeWithMetadata,
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
  entityType: Pick<EntityType, "allOf"> & { $id?: EntityType["$id"] },
  allEntityTypes: Record<VersionedUrl, EntityTypeWithMetadata>,
): { file: boolean; image: boolean; link: boolean } => {
  const parentIds = getParentIds(entityType, allEntityTypes);

  let isFile = entityType.$id === types.entityType.file.entityTypeId;
  let isImage = entityType.$id === types.entityType.imageFile.entityTypeId;
  let isLink = false;

  for (const id of parentIds) {
    if (
      extractBaseUrl(id) === extractBaseUrl(types.entityType.file.entityTypeId)
    ) {
      isFile = true;
    }
    if (
      extractBaseUrl(id) ===
      extractBaseUrl(types.entityType.imageFile.entityTypeId)
    ) {
      isImage = true;
    }
    if (extractBaseUrl(id) === extractBaseUrl(linkEntityTypeUrl)) {
      isLink = true;
    }
  }

  return {
    file: isFile,
    image: isImage,
    link: isLink,
  };
};
