import type { BaseUrl } from "@local/hash-graph-types/ontology";
import type { EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getBreadthFirstEntityTypesAndParents,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import type { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  entitySubgraph: Subgraph<EntityRootType>,
): PropertyRow[] => {
  const entity = getRoots(entitySubgraph)[0]!;

  const entityTypeAndAncestors = getBreadthFirstEntityTypesAndParents(
    entitySubgraph,
    entity.metadata.entityTypeIds,
  );

  const requiredPropertyTypes = entityTypeAndAncestors.flatMap(
    (type) => (type.schema.required ?? []) as BaseUrl[],
  );

  const processedPropertyTypes = new Set<BaseUrl>();

  return entityTypeAndAncestors.flatMap((entityType) =>
    Object.keys(entityType.schema.properties).flatMap((propertyTypeBaseUrl) => {
      if (processedPropertyTypes.has(propertyTypeBaseUrl as BaseUrl)) {
        return [];
      }

      const propertyRefSchema =
        entityType.schema.properties[propertyTypeBaseUrl];

      if (!propertyRefSchema) {
        throw new Error("Property not found");
      }

      processedPropertyTypes.add(propertyTypeBaseUrl as BaseUrl);

      return generatePropertyRowRecursively({
        propertyTypeBaseUrl: propertyTypeBaseUrl as BaseUrl,
        propertyKeyChain: [propertyTypeBaseUrl as BaseUrl],
        entity,
        entitySubgraph,
        requiredPropertyTypes,
        propertyRefSchema,
      });
    }),
  );
};
