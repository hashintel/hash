import { Subgraph, SubgraphRootTypes } from "@local/hash-subgraph";
import { getEntityTypeById } from "@local/hash-subgraph/src/stdlib/element/entity-type";
import { getRoots } from "@local/hash-subgraph/src/stdlib/roots";

import { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  entitySubgraph: Subgraph<SubgraphRootTypes["entity"]>,
): PropertyRow[] => {
  const entity = getRoots(entitySubgraph)[0]!;

  const entityType = getEntityTypeById(
    entitySubgraph,
    entity.metadata.entityTypeId,
  );

  if (!entityType) {
    return [];
  }

  const requiredPropertyTypes = entityType.schema.required ?? [];

  return Object.keys(entityType.schema.properties).map(
    (propertyTypeBaseUri) => {
      const property = entityType.schema.properties[propertyTypeBaseUri];

      if (!property) {
        throw new Error("Property not found");
      }

      return generatePropertyRowRecursively({
        propertyTypeBaseUri,
        propertyKeyChain: [propertyTypeBaseUri],
        entity,
        entitySubgraph,
        requiredPropertyTypes,
        propertyOnEntityTypeSchema: property,
      });
    },
  );
};
