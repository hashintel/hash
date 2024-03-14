import { extractBaseUrl } from "@blockprotocol/type-system";
import type {
  EntityType,
  VersionedUrl,
} from "@blockprotocol/type-system/dist/cjs";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityTypeWithMetadata } from "@local/hash-subgraph";
import { linkEntityTypeUrl } from "@local/hash-subgraph";

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
): { isFile: boolean; isImage: boolean; isLink: boolean } => {
  const parentIds = getParentIds(entityType, allEntityTypes);

  let isFile = entityType.$id
    ? extractBaseUrl(entityType.$id) ===
      systemEntityTypes.file.entityTypeBaseUrl
    : false;

  let isImage = entityType.$id
    ? extractBaseUrl(entityType.$id) ===
      systemEntityTypes.image.entityTypeBaseUrl
    : false;

  let isLink = false;

  for (const id of parentIds) {
    if (extractBaseUrl(id) === systemEntityTypes.file.entityTypeBaseUrl) {
      isFile = true;
    }
    if (extractBaseUrl(id) === systemEntityTypes.image.entityTypeBaseUrl) {
      isImage = true;
    }
    if (extractBaseUrl(id) === extractBaseUrl(linkEntityTypeUrl)) {
      isLink = true;
    }
  }

  return {
    isFile,
    isImage,
    isLink,
  };
};
