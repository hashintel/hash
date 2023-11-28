import { VersionedUrl } from "@blockprotocol/type-system";
import {
  Attachment,
  Comment,
  CustomView,
  Cycle,
  Document,
  IssueLabel,
  Project,
  ProjectMilestone,
} from "@linear/sdk";
import {
  getLinearMappingByLinearType,
  SupportedLinearTypeNames,
  SupportedLinearTypes,
  SupportedLinearUpdateInput,
} from "@local/hash-backend-utils/linear-type-mappings";
import { PartialEntity } from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import {
  AccountId,
  Entity,
  EntityId,
  EntityPropertiesObject,
  EntityPropertyValue,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getEntitiesByLinearId } from "./util";

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

export const mapHashEntityToLinearUpdateInput = <
  T extends SupportedLinearTypeNames,
>(params: {
  linearType: T;
  entity: Entity;
}): SupportedLinearUpdateInput[T] => {
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

  /** @todo: account for link mappings */

  return updateInput;
};

export const issueLabelToEntity = (_issueLabel: IssueLabel): object => {
  return {};
};

export const cycleToEntity = (_cycle: Cycle): object => {
  return {};
};

export const customViewToEntity = (_customView: CustomView): object => {
  return {};
};

export const projectToEntity = (_project: Project): object => {
  return {};
};

export const commentToEntity = (_comment: Comment): object => {
  return {};
};

export const projectMilestoneToEntity = (
  _projectMilestone: ProjectMilestone,
): object => {
  return {};
};

export const documentToEntity = (_document: Document): object => {
  return {};
};

export const attachmentToEntity = (_attachment: Attachment): object => {
  return {};
};
