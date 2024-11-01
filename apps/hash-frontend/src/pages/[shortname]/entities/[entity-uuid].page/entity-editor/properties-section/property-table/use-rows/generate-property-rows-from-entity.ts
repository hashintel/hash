import type { ClosedMultiEntityType } from "@blockprotocol/type-system";
import type { BaseUrl } from "@local/hash-graph-types/ontology";

import type { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  closedEntitySchema: ClosedMultiEntityType,
): PropertyRow[] => {
  const requiredPropertyTypes = closedEntitySchema.required;

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
