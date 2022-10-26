import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import {
  getPersistedDataType,
  getPropertyTypesByBaseUri,
  getPersistedEntityType,
  RootEntityAndSubgraph,
  Subgraph,
} from "../../../../../../../lib/subgraph";
import { PropertyRow } from "./types";

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

export const generatePropertyRowsFromEntity = (
  rootEntityAndSubgraph: RootEntityAndSubgraph,
): PropertyRow[] => {
  const entity = rootEntityAndSubgraph.root;

  const entityType = getPersistedEntityType(
    rootEntityAndSubgraph.subgraph,
    entity.entityTypeId,
  );

  const requiredPropertyTypes = entityType?.inner.required;

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

    const required = !!requiredPropertyTypes?.includes(propertyTypeBaseUri);

    return {
      ...propertyType,
      value: entity.properties[propertyTypeBaseUri],
      propertyTypeId: propertyTypeBaseUri,
      dataTypes,
      required,
    };
  });
};
