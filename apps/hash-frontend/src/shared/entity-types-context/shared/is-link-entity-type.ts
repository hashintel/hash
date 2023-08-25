import { EntityType, VersionedUrl } from "@blockprotocol/type-system/dist/cjs";
import {
  EntityTypeWithMetadata,
  linkEntityTypeUrl,
} from "@local/hash-subgraph";

export const isLinkEntityType = (
  entityType: Pick<EntityType, "allOf">,
  allEntityTypes: Record<VersionedUrl, EntityTypeWithMetadata>,
) => {
  let parentRefObjects = entityType.allOf ?? [];
  while (parentRefObjects.length) {
    if (parentRefObjects.find(({ $ref }) => $ref === linkEntityTypeUrl)) {
      return true;
    }

    parentRefObjects = parentRefObjects.flatMap(({ $ref }) => {
      const parentEntityType = allEntityTypes[$ref];
      if (!parentEntityType) {
        throw new Error(
          `Entity type ${$ref} not found when looking up ancestors of entity type`,
        );
      }
      return parentEntityType.schema.allOf ?? [];
    });
  }
  return false;
};
