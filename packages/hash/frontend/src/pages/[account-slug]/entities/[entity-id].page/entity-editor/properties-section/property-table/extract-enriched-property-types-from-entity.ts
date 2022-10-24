import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import { EntityResponse } from "../../../../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import {
  getPersistedDataType,
  getPropertyTypesByBaseUri,
  getPersistedEntityType,
} from "../../../../../../../lib/subgraph";
import { EnrichedPropertyType } from "./types";

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
  const entityType = getPersistedEntityType(
    entity.entityTypeRootedSubgraph,
    entity.entityTypeId,
  );

  const requiredPropertyTypes = entityType?.inner.required;

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
