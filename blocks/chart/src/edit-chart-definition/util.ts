import type { EntityType, PropertyType, Subgraph } from "@blockprotocol/graph";
import {
  getEntityTypeById,
  getPropertyTypeById,
} from "@blockprotocol/graph/stdlib";

export const getEntityTypePropertyTypes = (
  subgraph: Subgraph,
  entityType: EntityType,
): PropertyType[] => {
  const propertyTypeIds = Object.values(entityType.properties).map((value) =>
    "$ref" in value ? value.$ref : value.items.$ref,
  );

  const propertyTypes = propertyTypeIds.map((propertyTypeId) => {
    const propertyType = getPropertyTypeById(subgraph, propertyTypeId)?.schema;

    if (!propertyType) {
      throw new Error(
        `Could not get property type from subgraph: ${propertyTypeId}`,
      );
    }

    return propertyType;
  });

  return [
    ...propertyTypes,
    ...(entityType.allOf
      ?.map(({ $ref }) => {
        const inheritsFromEntityType = getEntityTypeById(
          subgraph,
          $ref,
        )?.schema;

        if (!inheritsFromEntityType) {
          throw new Error(
            `Could not get inherited entity type from subgraph: ${$ref}`,
          );
        }

        return getEntityTypePropertyTypes(subgraph, inheritsFromEntityType);
      })
      .flat() ?? []),
  ];
};
