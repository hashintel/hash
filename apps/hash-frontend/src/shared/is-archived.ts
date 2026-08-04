import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";

import { isEntityPageEntity, isType } from "./is-of-type";

import type {
  DataTypeWithMetadata,
  EntityId,
  EntityTypeWithMetadata,
  PropertyObject,
  PropertyTypeWithMetadata,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";

/**
 * The slice of an entity that archival state and the archive actions read.
 * Full entities satisfy it structurally, as do lighter objects assembled from
 * table rows.
 *
 * Deliberately not a `Pick` of `Entity`: a Pick would drag in the full entity
 * metadata (provenance, temporal versioning) that row-assembled objects lack,
 * and `entityTypeIds` weakens the metadata's non-empty tuple to a plain array
 * so those objects qualify. `archived` stays optional because the ontology
 * type union members in {@link isItemArchived} carry no such field, which is
 * also why callers probe it with an `in` check.
 */
export type ArchivableEntity = {
  metadata: {
    recordId: { entityId: EntityId };
    entityTypeIds: VersionedUrl[];
    archived?: boolean;
  };
  properties: PropertyObject;
};

export const isTypeArchived = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => type.metadata.temporalVersioning.transactionTime.end.kind === "exclusive";

export const isPageArchived = (pageEntity: ArchivableEntity) => {
  if (!isEntityPageEntity(pageEntity)) {
    throw new Error("Not a page entity");
  }

  const { archived } = simplifyProperties(
    pageEntity.properties as PageProperties,
  );

  return archived ?? false;
};

export const isItemArchived = (
  item:
    | ArchivableEntity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => {
  if (isType(item)) {
    return isTypeArchived(item);
  } else if (isEntityPageEntity(item)) {
    /**
     * @todo H-2633 use entity archival via temporal axes, not metadata boolean
     */
    return isPageArchived(item);
  }

  /**
   * @todo H-2633 use entity archival via temporal axes, not metadata boolean
   */
  return "archived" in item.metadata && item.metadata.archived;
};
