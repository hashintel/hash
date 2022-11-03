import {
  getPersistedEntityType,
  RootEntityAndSubgraph,
} from "../../../../../../../../lib/subgraph";
import { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  rootEntityAndSubgraph: RootEntityAndSubgraph,
): PropertyRow[] => {
  const { entityTypeId, properties } = rootEntityAndSubgraph.root;

  const entityType = getPersistedEntityType(
    rootEntityAndSubgraph.subgraph,
    entityTypeId,
  );

  const requiredPropertyTypes = entityType?.inner.required ?? [];

  return Object.keys(properties).map((propertyTypeBaseUri) =>
    generatePropertyRowRecursively(
      properties,
      propertyTypeBaseUri,
      [propertyTypeBaseUri],
      rootEntityAndSubgraph,
      requiredPropertyTypes,
    ),
  );
};
