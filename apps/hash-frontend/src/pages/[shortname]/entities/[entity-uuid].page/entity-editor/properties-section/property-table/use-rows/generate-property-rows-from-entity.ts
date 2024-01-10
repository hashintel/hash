import { BaseUrl, EntityRootType, Subgraph } from "@local/hash-subgraph";
import {
  getEntityTypeAndParentsById,
  getRoots,
} from "@local/hash-subgraph/stdlib";

import { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  entitySubgraph: Subgraph<EntityRootType>,
): PropertyRow[] => {
  const entity = getRoots(entitySubgraph)[0]!;

  const entityTypeAndAncestors = getEntityTypeAndParentsById(
    entitySubgraph,
    entity.metadata.entityTypeId,
  );

  const requiredPropertyTypes = entityTypeAndAncestors.flatMap(
    (type) => (type.schema.required ?? []) as BaseUrl[],
  );

  return entityTypeAndAncestors.flatMap((entityType) =>
    Object.keys(entityType.schema.properties).map((propertyTypeBaseUrl) => {
      const propertyRefSchema =
        entityType.schema.properties[propertyTypeBaseUrl];

      if (!propertyRefSchema) {
        throw new Error("Property not found");
      }

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
