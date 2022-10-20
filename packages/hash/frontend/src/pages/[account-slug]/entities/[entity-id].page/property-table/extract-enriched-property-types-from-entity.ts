import { PropertyType } from "@blockprotocol/type-system-web";
import { capitalize } from "@mui/material";
import { EntityResponse } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/knowledge-shim";
import { EnrichedPropertyType } from "./types";

const getDataTypesOfPropertyType = (
  propertyType: PropertyType,
  entity: EntityResponse,
) => {
  return propertyType.oneOf.map((propertyValue) => {
    if ("$ref" in propertyValue) {
      const dataTypeId = propertyValue.$ref;
      return (
        entity.entityTypeRootedSubgraph.referencedDataTypes.find(
          (val) => val.dataTypeId === dataTypeId,
        )?.dataType.title ?? "undefined"
      );
    }

    return capitalize(propertyValue.type);
  });
};

export const extractEnrichedPropertyTypesFromEntity = (
  entity: EntityResponse,
): EnrichedPropertyType[] => {
  return Object.keys(entity.properties).map((propertyTypeId) => {
    const { propertyType } =
      entity.entityTypeRootedSubgraph.referencedPropertyTypes.find((val) =>
        val.propertyTypeId.startsWith(propertyTypeId),
      ) ?? {};

    if (!propertyType) {
      throw new Error("propertyType not found");
    }

    const dataTypes = getDataTypesOfPropertyType(propertyType, entity);

    return {
      ...propertyType,
      value: entity.properties[propertyTypeId],
      propertyTypeId,
      dataTypes,
    };
  });
};
