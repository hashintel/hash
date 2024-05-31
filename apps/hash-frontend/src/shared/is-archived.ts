import type { Entity } from "@local/hash-graph-sdk/entity";
import type {
  DataTypeWithMetadata,
  EntityTypeWithMetadata,
  PropertyTypeWithMetadata,
} from "@local/hash-graph-types/ontology";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { PageProperties } from "@local/hash-isomorphic-utils/system-types/shared";

import { isEntityPageEntity, isType } from "./is-of-type";

export const isTypeArchived = (
  type:
    | EntityTypeWithMetadata
    | PropertyTypeWithMetadata
    | DataTypeWithMetadata,
) => type.metadata.temporalVersioning.transactionTime.end.kind === "exclusive";

export const isPageArchived = (pageEntity: Entity) => {
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
