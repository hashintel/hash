import { BaseUrl, EntityRootType, Subgraph } from "@local/hash-subgraph";
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

  const requiredPropertyTypes = (entityType.schema.required ?? []) as BaseUrl[];

  return Object.keys(entityType.schema.properties).map(
    (propertyTypeBaseUrl) => {
      const property = entityType.schema.properties[propertyTypeBaseUrl];

      if (!property) {
        throw new Error("Property not found");
      }

      return generatePropertyRowRecursively({
        propertyTypeBaseUrl: propertyTypeBaseUrl as BaseUrl,
        propertyKeyChain: [propertyTypeBaseUrl as BaseUrl],
        entity,
        entitySubgraph,
        requiredPropertyTypes,
        propertyOnEntityTypeSchema: property,
      });
    },
  );
};
