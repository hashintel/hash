import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  DataTypeWithMetadata,
  Entity,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { isEntityPageEntity, isType } from "./is-of-type";

export const isTypeArchived = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) =>
  type.metadata.custom.temporalVersioning.transactionTime.end.kind ===
  "exclusive";

export const isPageArchived = (pageEntity: Entity) => {
  if (!isEntityPageEntity(pageEntity)) {
    throw new Error("Not a page entity");
  }

  return (
    (pageEntity.properties[
      extractBaseUrl(systemTypes.propertyType.archived.propertyTypeId)
    ] as boolean | undefined) ?? false
  );
};

export const isItemArchived = (
  item:
    | Entity
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => {
  if (isType(item)) {
    return isTypeArchived(item);
  } else if (isEntityPageEntity(item)) {
    return isPageArchived(item);
  }
  return false;
};
