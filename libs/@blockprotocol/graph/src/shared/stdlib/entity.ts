import type { Entity, Subgraph } from "../types";
import { getEntityTypeById } from "./subgraph/element/entity-type";
import { getPropertyTypesByBaseUrl } from "./subgraph/element/property-type";

export const parseLabelFromEntity = <Temporal extends boolean>(
  entityToLabel: Entity<Temporal>,
  subgraph: Subgraph<Temporal>,
): string => {
  const getFallbackLabel = () => {
    // fallback to the entity type and a few characters of the entityId
    const entityId = entityToLabel.metadata.recordId.entityId;

    const entityType = getEntityTypeById(
      subgraph,
      entityToLabel.metadata.entityTypeId,
    );
    const entityTypeName = entityType?.schema.title ?? "Entity";

    return `${entityTypeName}-${entityId.slice(0, 5)}`;
  };

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferred name",
    "display name",
    "title",
    "shortname",
  ];

  const propertyTypes: { title?: string; propertyTypeBaseUrl: string }[] =
    Object.keys(entityToLabel.properties).map((propertyTypeBaseUrl) => {
      /** @todo - pick the latest version, or the version in the entity type, rather than first element? */
      const [propertyType] = getPropertyTypesByBaseUrl(
        subgraph,
        propertyTypeBaseUrl,
      );

      return propertyType
        ? {
            title: propertyType.schema.title.toLowerCase(),
            propertyTypeBaseUrl,
          }
        : {
            title: undefined,
            propertyTypeBaseUrl,
          };
    });

  // Try various options in decreasing confidence:

  // Take the property type if the title is one of the options
  for (const option of options) {
    for (const { title, propertyTypeBaseUrl } of propertyTypes) {
      if (title !== undefined && title.toLowerCase() === option) {
        if (typeof entityToLabel.properties[propertyTypeBaseUrl] === "string") {
          return entityToLabel.properties[propertyTypeBaseUrl] as string;
        }
      }
    }
  }

  // See if the title includes one of the options
  for (const option of options) {
    for (const { title, propertyTypeBaseUrl } of propertyTypes) {
      if (title !== undefined && title.toLowerCase().includes(option)) {
        if (typeof entityToLabel.properties[propertyTypeBaseUrl] === "string") {
          return entityToLabel.properties[propertyTypeBaseUrl] as string;
        }
      }
    }
  }

  // See if the property type base url includes one of the options
  for (const option of options) {
    for (const propertyTypeBaseUrl of Object.keys(entityToLabel.properties)) {
      if (propertyTypeBaseUrl.toLowerCase().includes(option)) {
        if (typeof entityToLabel.properties[propertyTypeBaseUrl] === "string") {
          return entityToLabel.properties[propertyTypeBaseUrl] as string;
        }
      }
    }
  }

  return getFallbackLabel();
};
