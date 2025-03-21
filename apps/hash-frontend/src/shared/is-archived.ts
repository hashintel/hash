import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";

import { isEntityPageEntity, isType } from "./is-of-type";

export const isTypeArchived = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => type.metadata.temporalVersioning.transactionTime.end.kind === "exclusive";

export const isPageArchived = (pageEntity: HashEntity) => {
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
    | HashEntity
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
