import { Subgraph, SubgraphRootTypes } from "@hashintel/hash-subgraph";
import { getRoots } from "@hashintel/hash-subgraph/src/stdlib/roots";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
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

  const requiredPropertyTypes = entityType?.schema.required ?? [];

  return Object.keys(entity.properties).map((propertyTypeBaseUri) =>
    generatePropertyRowRecursively(
      entity.properties,
      propertyTypeBaseUri,
      [propertyTypeBaseUri],
      entitySubgraph,
      requiredPropertyTypes,
    ),
  );
};
