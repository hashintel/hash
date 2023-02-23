import {
  Entity as EntityNonTemporal,
  Subgraph as SubgraphNonTemporal,
} from "@blockprotocol/graph";
import { isTemporalSubgraph } from "@blockprotocol/graph/internal";
import {
  getEntityTypeById as getEntityTypeByIdNonTemporal,
  getPropertyTypesByBaseUri as getPropertyTypesByBaseUriNonTemporal,
} from "@blockprotocol/graph/stdlib";
import {
  Entity as EntityTemporal,
  Subgraph as SubgraphTemporal,
} from "@blockprotocol/graph/temporal";
import {
  getEntityTypeById as getEntityTypeByIdTemporal,
  getPropertyTypesByBaseUri as getPropertyTypesByBaseUriTemporal,
} from "@blockprotocol/graph/temporal/stdlib";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";

// @todo don't copy/paste from BP
export const parseLabelFromEntity = (
  entityToLabel: EntityTemporal | EntityNonTemporal,
  subgraph: SubgraphTemporal | SubgraphNonTemporal,
) => {
  const getFallbackLabel = () => {
    // fallback to the entity type and a few characters of the entityId
    const entityId = entityToLabel.metadata.recordId.entityId;

    const entityType = isTemporalSubgraph(subgraph)
      ? getEntityTypeByIdTemporal(subgraph, entityToLabel.metadata.entityTypeId)
      : getEntityTypeByIdNonTemporal(
          subgraph,
          entityToLabel.metadata.entityTypeId,
        );
    const entityTypeName = entityType?.schema.title ?? "Entity";

    return `${entityTypeName}-${entityId.slice(0, 5)}`;
  };

  const getFallbackIfNotString = (val: any) => {
    if (!val || typeof val !== "string") {
      return getFallbackLabel();
    }

    return val;
  };

  // fallback to some likely display name properties
  const options = [
    "name",
    "preferred name",
    "display name",
    "title",
    "shortname",
  ];

  // @todo remove slug based match when MDB supports property types in subgraph
  const propertyTypes = Object.keys(entityToLabel.properties).map(
    (propertyTypeBaseUri) => {
      /** @todo - pick the latest version, or the version in the entity type, rather than first element? */
      const [propertyType] = isTemporalSubgraph(subgraph)
        ? getPropertyTypesByBaseUriTemporal(subgraph, propertyTypeBaseUri)
        : getPropertyTypesByBaseUriNonTemporal(subgraph, propertyTypeBaseUri);

      const slug = propertyTypeBaseUri.split("/").at(-2);

      return propertyType
        ? {
            title: propertyType.schema.title.toLowerCase(),
            propertyTypeBaseUri,
            slug,
          }
        : {
            title: undefined,
            propertyTypeBaseUri,
            slug,
          };
    },
  );

  for (const option of options) {
    const targetSlug = slugifyTypeTitle(option);
    const type = propertyTypes.find(
      ({ title, slug }) => title === option || slug === targetSlug,
    );

    if (type) {
      return getFallbackIfNotString(
        entityToLabel.properties[type.propertyTypeBaseUri],
      );
    }
  }

  return getFallbackLabel();
};
