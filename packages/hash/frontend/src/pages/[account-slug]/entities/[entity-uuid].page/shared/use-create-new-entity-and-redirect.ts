import {
  EntityType,
  PropertyType,
  VersionedUri,
} from "@blockprotocol/type-system";
import {
  extractEntityUuidFromEntityId,
  PropertyObject,
  Subgraph,
} from "@hashintel/hash-subgraph";
import { getEntityTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/entity-type";
import { getPropertyTypeById } from "@hashintel/hash-subgraph/src/stdlib/element/property-type";
import { useRouter } from "next/router";
import { useCallback } from "react";
import { useBlockProtocolCreateEntity } from "../../../../../components/hooks/blockProtocolFunctions/knowledge/useBlockProtocolCreateEntity";
import { useBlockProtocolGetEntityType } from "../../../../../components/hooks/blockProtocolFunctions/ontology/useBlockProtocolGetEntityType";
import { getOwnedById } from "../../../../../lib/get-owned-by-id";
import { MinimalOrg } from "../../../../../lib/org";
import {
  isPropertyValueArray,
  isPropertyValueNested,
} from "../../../../../lib/typeguards";
import { User } from "../../../../../lib/user";

/**
 * @todo this will be deleted when https://app.asana.com/0/1203312852763953/1203433085114587/f (internal) is implemented
 */
const getDefaultValueOfPropertyType = (
  propertyType: PropertyType | undefined,
  subgraph: Subgraph,
) => {
  /**
   * if there are multiple expected types, those are not expected to be arrays or nested properties.
   * So it's safe to return empty string on this case
   */
  if (!propertyType || propertyType.oneOf.length > 1) {
    return "";
  }

  const propertyValue = propertyType.oneOf[0];

  // return empty array for arrays
  if (isPropertyValueArray(propertyValue)) {
    return [];
  }

  // recursively get default properties for nested properties
  if (isPropertyValueNested(propertyValue)) {
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    return generateDefaultProperties(propertyValue.properties, subgraph);
  }

  // empty string works for number, text & boolean
  return "";
};

/**
 * @todo this will be deleted when https://app.asana.com/0/1203312852763953/1203433085114587/f (internal) is implemented
 */
export const generateDefaultProperties = (
  properties: EntityType["properties"],
  subgraph: Subgraph,
) => {
  const result: PropertyObject = {};

  for (const propertyKey of Object.keys(properties)) {
    const property = properties[propertyKey];

    if (property) {
      const propertyTypeId =
        "$ref" in property ? property.$ref : property.items.$ref;

      const propertyType = getPropertyTypeById(
        subgraph,
        propertyTypeId,
      )?.schema;

      result[propertyKey] = getDefaultValueOfPropertyType(
        propertyType,
        subgraph,
      );
    }
  }

  return result;
};

export const useCreateNewEntityAndRedirect = () => {
  const router = useRouter();
  const { createEntity } = useBlockProtocolCreateEntity();
  const { getEntityType } = useBlockProtocolGetEntityType();

  const createNewEntityAndRedirect = useCallback(
    async (
      activeWorkspace: User | MinimalOrg,
      entityTypeId: VersionedUri,
      replace = false,
      abortSignal?: AbortSignal,
    ) => {
      const { data: subgraph } = await getEntityType({
        data: {
          entityTypeId,
          graphResolveDepths: {
            constrainsValuesOn: { outgoing: 0 },
            constrainsLinksOn: { outgoing: 0 },
            constrainsLinkDestinationsOn: { outgoing: 0 },
            constrainsPropertiesOn: { outgoing: 1 },
          },
        },
      });

      if (abortSignal?.aborted) {
        return;
      }

      if (!subgraph) {
        throw new Error("subgraph not found");
      }

      const { schema: entityType } =
        getEntityTypeById(subgraph, entityTypeId) ?? {};

      if (!entityType) {
        throw new Error("persisted entity type not found");
      }
      const ownedById = getOwnedById(activeWorkspace);

      const { data: entity } = await createEntity({
        data: {
          entityTypeId: entityType.$id,
          ownedById,
          /**
           * @todo after implementing this ticket: https://app.asana.com/0/1203312852763953/1203433085114587/f (internal)
           * we should just use `properties: {}` here, and delete `generateDefaultProperties` function,
           * this is a temporary workaround for entity table to show the rows with empty values
           */
          properties: generateDefaultProperties(
            entityType.properties,
            subgraph,
          ),
        },
      });

      if (!entity) {
        throw new Error("Failed to create entity");
      }

      const entityId = extractEntityUuidFromEntityId(
        entity.metadata.editionId.baseId,
      );

      if (!abortSignal?.aborted) {
        const url = `/@${activeWorkspace.shortname}/entities/${entityId}`;
        if (replace) {
          await router.replace(url);
        } else {
          await router.push(url);
        }
      }
    },
    [router, createEntity, getEntityType],
  );

  return createNewEntityAndRedirect;
};
