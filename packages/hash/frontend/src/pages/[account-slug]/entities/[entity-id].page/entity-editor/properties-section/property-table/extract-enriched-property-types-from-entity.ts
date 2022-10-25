import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import {
  getPersistedDataType,
  getPropertyTypesByBaseUri,
  RootEntityAndSubgraph,
  Subgraph,
} from "../../../../../../../lib/subgraph";
import { EnrichedPropertyType } from "./types";

const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  subgraph: Subgraph,
) => {
  return propertyType.oneOf.map((propertyValue) => {
    if ("$ref" in propertyValue) {
      const dataTypeId = propertyValue?.$ref;
      const persistedDataType = getPersistedDataType(subgraph, dataTypeId);

      return persistedDataType ? persistedDataType.inner.title : "undefined";
    }

    return capitalize(propertyValue.type);
  });
};

export const extractEnrichedPropertyTypesFromEntity = (
  rootEntityAndSubgraph: RootEntityAndSubgraph,
): EnrichedPropertyType[] => {
  const entity = rootEntityAndSubgraph.root;

  return Object.keys(entity.properties).map((propertyTypeBaseUri) => {
    const propertyTypeVersions = getPropertyTypesByBaseUri(
      rootEntityAndSubgraph.subgraph,
      propertyTypeBaseUri,
    );

    if (!propertyTypeVersions) {
      throw new Error(
        `propertyType not found for base URI: ${propertyTypeBaseUri}`,
      );
    }

    const propertyType = propertyTypeVersions[0]!.inner;

    const dataTypes = getDataTypesOfPropertyType(
      propertyType,
      rootEntityAndSubgraph.subgraph,
    );

    return {
      ...propertyType,
      value: entity.properties[propertyTypeBaseUri],
      propertyTypeId: propertyTypeBaseUri,
      dataTypes,
    };
  });
};
