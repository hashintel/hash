import {
  getPersistedEntityType,
  RootEntityAndSubgraph,
} from "../../../../../../../../lib/subgraph";
import { PropertyRow } from "../types";
import { generatePropertyRowRecursively } from "./generate-property-rows-from-entity/generate-property-row-recursively";

export const generatePropertyRowsFromEntity = (
  rootEntityAndSubgraph: RootEntityAndSubgraph,
): PropertyRow[] => {
  const entity = rootEntityAndSubgraph.root;

  const entityType = getPersistedEntityType(
    rootEntityAndSubgraph.subgraph,
    entity.entityTypeId,
  );

  const requiredPropertyTypes = entityType?.inner.required ?? [];

  return Object.keys(entity.properties).map((propertyTypeBaseUri) =>
    generatePropertyRowRecursively({
      propertyTypeBaseUri,
      rootEntityAndSubgraph,
      requiredPropertyTypes,
      properties: entity.properties,
      propertyKeyChain: [propertyTypeBaseUri],
    }),
  );
};
