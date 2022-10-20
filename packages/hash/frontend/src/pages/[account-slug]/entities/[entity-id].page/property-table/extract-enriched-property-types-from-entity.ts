import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import { EntityResponse } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { EnrichedPropertyType } from "./types";
import {
  getPersistedDataType,
  getPropertyTypesByBaseUri,
} from "../../../../../lib/subgraph";

const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  entity: EntityResponse,
) => {
  return propertyType.oneOf.map((propertyValue) => {
    if ("$ref" in propertyValue) {
      const dataTypeId = propertyValue?.$ref;
      const persistedDataType = getPersistedDataType(
        entity.entityTypeRootedSubgraph,
        dataTypeId,
      );

      return persistedDataType ? persistedDataType.inner.title : "undefined";
    }

    return capitalize(propertyValue.type);
  });
};

export const extractEnrichedPropertyTypesFromEntity = (
  entity: EntityResponse,
): EnrichedPropertyType[] => {
  return Object.keys(entity.properties).map((propertyTypeBaseUri) => {
    const propertyTypeVersions = getPropertyTypesByBaseUri(
      entity.entityTypeRootedSubgraph,
      propertyTypeBaseUri,
    );

    if (!propertyTypeVersions) {
      throw new Error(
        `propertyType not found for base URI: ${propertyTypeBaseUri}`,
      );
    }

    const propertyType = propertyTypeVersions[0]!.inner;

    const dataTypes = getDataTypesOfPropertyType(propertyType, entity);

    return {
      ...propertyType,
      value: entity.properties[propertyTypeBaseUri],
      propertyTypeId: propertyTypeBaseUri,
      dataTypes,
    };
  });
};
