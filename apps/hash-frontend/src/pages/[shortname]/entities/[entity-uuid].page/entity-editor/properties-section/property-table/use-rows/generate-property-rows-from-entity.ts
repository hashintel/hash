import { BaseUri, EntityRootType, Subgraph } from "@local/hash-subgraph";
import { getEntityTypeById, getRoots } from "@local/hash-subgraph/stdlib";

import { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  entitySubgraph: Subgraph<EntityRootType>,
): PropertyRow[] => {
  const entity = getRoots(entitySubgraph)[0]!;

  const entityType = getEntityTypeById(
    entitySubgraph,
    entity.metadata.entityTypeId,
  );

  if (!entityType) {
    return [];
  }

  const requiredPropertyTypes = (entityType.schema.required ?? []) as BaseUri[];

  return Object.keys(entityType.schema.properties).map(
    (propertyTypeBaseUri) => {
      const property = entityType.schema.properties[propertyTypeBaseUri];

      if (!property) {
        throw new Error("Property not found");
      }

      return generatePropertyRowRecursively({
        propertyTypeBaseUri: propertyTypeBaseUri as BaseUri,
        propertyKeyChain: [propertyTypeBaseUri as BaseUri],
        entity,
        entitySubgraph,
        requiredPropertyTypes,
        propertyOnEntityTypeSchema: property,
      });
    },
  );
};
