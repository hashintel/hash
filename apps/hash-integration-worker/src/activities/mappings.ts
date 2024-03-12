import type { VersionedUrl } from "@blockprotocol/type-system";
import type {
  SupportedLinearTypeNames,
  SupportedLinearTypes,
  SupportedLinearUpdateInput,
} from "@local/hash-backend-utils/linear-type-mappings";
import { getLinearMappingByLinearType } from "@local/hash-backend-utils/linear-type-mappings";
import type { PartialEntity } from "@local/hash-backend-utils/temporal-workflow-types";
import type { GraphApi } from "@local/hash-graph-client";
import type {
  AccountId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityPropertyValue,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import {
  getEntitiesByLinearId,
  getEntityOutgoingLinks,
  getLatestEntityById,
} from "./graph-requests";

export const mapLinearDataToEntity = <
  T extends SupportedLinearTypeNames,
>(params: {
  linearType: T;
  linearData: SupportedLinearTypes[T];
}): PartialEntity => {
  const { linearType } = params;

  const mapping = getLinearMappingByLinearType({ linearType });

  const properties: EntityPropertiesObject = {};

  for (const {
    linearPropertyKey,
    hashPropertyTypeId,
    mapLinearValueToHashValue,
  } of mapping.propertyMappings) {
    const linearValue = params.linearData[linearPropertyKey];

    const mappedValue =
      typeof linearValue !== "undefined"
        ? mapLinearValueToHashValue
          ? mapLinearValueToHashValue(linearValue)
          : (linearValue as EntityPropertyValue)
        : undefined;

    if (typeof mappedValue === "undefined") {
      continue;
    }

    properties[extractBaseUrl(hashPropertyTypeId)] = mappedValue;
  }

  return {
    entityTypeId: mapping.hashEntityTypeId,
    properties,
  };
};

export const mapLinearDataToEntityWithOutgoingLinks = async <
  T extends SupportedLinearTypeNames,
>(params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  linearType: T;
  linearData: SupportedLinearTypes[T];
}): Promise<{
  partialEntity: PartialEntity;
  outgoingLinks: {
    linkEntityTypeId: VersionedUrl;
    destinationEntityId: EntityId;
  }[];
}> => {
  const { linearType } = params;

  const mapping = getLinearMappingByLinearType({ linearType });

  const partialEntity = mapLinearDataToEntity(params);

  const outgoingLinks = await Promise.all(
    mapping.outgoingLinkMappings.map<
      Promise<
        {
          linkEntityTypeId: VersionedUrl;
          destinationEntityId: EntityId;
        }[]
      >
    >(async ({ getLinkDestinationLinearIds, linkEntityTypeId }) => {
      const { destinationLinearIds } = await getLinkDestinationLinearIds(
        params.linearData,
      );

      const destinationEntities = await Promise.all(
        destinationLinearIds.map((linearId) =>
          getEntitiesByLinearId({ ...params, linearId }).then((entities) => {
            /** @todo: handle multiple linear entities with the same ID in the same web */
            const [entity] = entities;

            if (!entity) {
              throw new Error(
                `Could not find entity with linear ID "${linearId}"`,
              );
            }

            return entity;
          }),
        ),
      );

      return destinationEntities.map((entity) => ({
        linkEntityTypeId,
        destinationEntityId: entity.metadata.recordId.entityId,
      }));
    }),
  ).then((outgoingLinksByType) => outgoingLinksByType.flat());

  return {
    partialEntity,
    outgoingLinks,
  };
};

export const mapHashEntityToLinearUpdateInput = async <
  T extends SupportedLinearTypeNames,
>(params: {
  graphApiClient: GraphApi;
  authentication: { actorId: AccountId };
  linearType: T;
  entity: Entity;
}): Promise<SupportedLinearUpdateInput[T]> => {
  const { entity, linearType } = params;

  const mapping = getLinearMappingByLinearType({
    linearType,
  });

  const updateInput: SupportedLinearUpdateInput[T] = {};

  for (const {
    hashPropertyTypeId,
    addHashValueToLinearUpdateInput,
  } of mapping.propertyMappings) {
    const hashValue = entity.properties[extractBaseUrl(hashPropertyTypeId)];

    if (typeof hashValue === "undefined") {
      /** @todo: allow for unsetting property values  */
      continue;
    }

    if (addHashValueToLinearUpdateInput) {
      addHashValueToLinearUpdateInput(updateInput, hashValue);
    }
  }

  const { graphApiClient, authentication } = params;

  const outgoingLinks = await getEntityOutgoingLinks({
    graphApiClient,
    authentication,
    entityId: entity.metadata.recordId.entityId,
  });

  for (const {
    linkEntityTypeId,
    addToLinearUpdateInput,
  } of mapping.outgoingLinkMappings) {
    const matchingOutgoingLinksWithRightEntities = await Promise.all(
      outgoingLinks
        .filter(
          (linkEntity) => linkEntity.metadata.entityTypeId === linkEntityTypeId,
        )
        .map(async (linkEntity) => ({
          linkEntity,
          rightEntity: await getLatestEntityById({
            graphApiClient,
            authentication,
            entityId: linkEntity.linkData.rightEntityId,
          }),
        })),
    );

    if (addToLinearUpdateInput) {
      addToLinearUpdateInput(
        updateInput,
        matchingOutgoingLinksWithRightEntities,
      );
    }
  }

  return updateInput;
};
