import { VersionedUrl } from "@blockprotocol/type-system";
import {
  Attachment,
  Comment,
  CustomView,
  Cycle,
  Document,
  Issue,
  IssueLabel,
  LinearDocument,
  Organization,
  Project,
  ProjectMilestone,
  User,
} from "@linear/sdk";
import { PartialEntity } from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import {
  blockProtocolPropertyTypes,
  linearEntityTypes,
  linearLinkEntityTypes,
  linearPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountId,
  EntityId,
  EntityPropertiesObject,
  EntityPropertyValue,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getEntitiesByLinearId } from "./util";

const mapLinearDateToIsoString = (date: string | Date): string => {
  if (typeof date === "string") {
    return date;
  }
  return date.toISOString();
};

type SupportedLinearTypes = {
  Issue: Issue;
  User: User;
  Organization: Organization;
};

type SupportedLinearTypeNames = keyof SupportedLinearTypes;

type PropertyMapping<
  LinearType extends SupportedLinearTypeNames,
  Key extends keyof SupportedLinearTypes[LinearType],
> = {
  linearPropertyKey: Key;
  hashPropertyTypeId: VersionedUrl;
  mapLinearValueToHashValue?: (
    linearValue: SupportedLinearTypes[LinearType][Key],
  ) => EntityPropertyValue | undefined;
};

type LinearMapping<T extends SupportedLinearTypeNames> = {
  linearType: T;
  hashEntityTypeId: VersionedUrl;
  propertyMappings: PropertyMapping<T, keyof SupportedLinearTypes[T]>[];
  outgoingLinkMappings: {
    getLinkDestinationLinearIds: (
      linearData: SupportedLinearTypes[T],
    ) => Promise<{ destinationLinearIds: string[] }>;
    linkEntityTypeId: VersionedUrl;
  }[];
};

const typeMappings = [
  {
    linearType: "Issue",
    hashEntityTypeId: linearEntityTypes.issue.entityTypeId,
    propertyMappings: [
      {
        linearPropertyKey: "archivedAt",
        hashPropertyTypeId: linearPropertyTypes.archivedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "archivedAt">,
      {
        linearPropertyKey: "autoArchivedAt",
        hashPropertyTypeId: linearPropertyTypes.autoArchivedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "autoArchivedAt">,
      {
        linearPropertyKey: "autoClosedAt",
        hashPropertyTypeId: linearPropertyTypes.autoClosedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "autoClosedAt">,
      {
        linearPropertyKey: "branchName",
        hashPropertyTypeId: linearPropertyTypes.branchName.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "branchName">,
      {
        linearPropertyKey: "canceledAt",
        hashPropertyTypeId: linearPropertyTypes.canceledAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "canceledAt">,
      {
        linearPropertyKey: "completedAt",
        hashPropertyTypeId: linearPropertyTypes.completedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "completedAt">,
      {
        linearPropertyKey: "createdAt",
        hashPropertyTypeId: linearPropertyTypes.createdAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          mapLinearDateToIsoString(linearValue),
      } satisfies PropertyMapping<"Issue", "createdAt">,
      {
        linearPropertyKey: "customerTicketCount",
        hashPropertyTypeId:
          linearPropertyTypes.customerTicketCount.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "customerTicketCount">,
      {
        linearPropertyKey: "description",
        hashPropertyTypeId:
          linearPropertyTypes.markdownDescription.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "description">,
      {
        linearPropertyKey: "dueDate",
        hashPropertyTypeId: linearPropertyTypes.dueDate.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "dueDate">,
      {
        linearPropertyKey: "estimate",
        hashPropertyTypeId: linearPropertyTypes.estimate.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "estimate">,
      {
        linearPropertyKey: "id",
        hashPropertyTypeId: linearPropertyTypes.id.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "id">,
      {
        linearPropertyKey: "identifier",
        hashPropertyTypeId: linearPropertyTypes.identifier.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "identifier">,
      {
        linearPropertyKey: "number",
        hashPropertyTypeId: linearPropertyTypes.issueNumber.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "number">,
      {
        linearPropertyKey: "previousIdentifiers",
        hashPropertyTypeId:
          linearPropertyTypes.previousIdentifier.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "previousIdentifiers">,
      {
        linearPropertyKey: "priority",
        hashPropertyTypeId: linearPropertyTypes.priority.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "priority">,
      {
        linearPropertyKey: "priorityLabel",
        hashPropertyTypeId: linearPropertyTypes.priorityLabel.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "priorityLabel">,
      {
        linearPropertyKey: "snoozedUntilAt",
        hashPropertyTypeId: linearPropertyTypes.snoozedUntilAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "snoozedUntilAt">,
      {
        linearPropertyKey: "sortOrder",
        hashPropertyTypeId: linearPropertyTypes.sortOrder.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "sortOrder">,
      {
        linearPropertyKey: "startedAt",
        hashPropertyTypeId: linearPropertyTypes.startedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "startedAt">,
      {
        linearPropertyKey: "startedTriageAt",
        hashPropertyTypeId: linearPropertyTypes.startedTriageAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "startedTriageAt">,
      {
        linearPropertyKey: "subIssueSortOrder",
        hashPropertyTypeId:
          linearPropertyTypes.subIssueSortOrder.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "subIssueSortOrder">,
      {
        linearPropertyKey: "title",
        hashPropertyTypeId: linearPropertyTypes.title.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "title">,
      {
        linearPropertyKey: "trashed",
        hashPropertyTypeId: linearPropertyTypes.trashed.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "trashed">,
      {
        linearPropertyKey: "triagedAt",
        hashPropertyTypeId: linearPropertyTypes.triagedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "triagedAt">,
      {
        linearPropertyKey: "updatedAt",
        hashPropertyTypeId: linearPropertyTypes.updatedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          mapLinearDateToIsoString(linearValue),
      } satisfies PropertyMapping<"Issue", "updatedAt">,
      {
        linearPropertyKey: "url",
        hashPropertyTypeId: linearPropertyTypes.issueUrl.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "url">,
    ],
    outgoingLinkMappings: [
      {
        getLinkDestinationLinearIds: async (issue) => {
          const assignee = await issue.assignee;
          return { destinationLinearIds: assignee ? [assignee.id] : [] };
        },
        linkEntityTypeId: linearLinkEntityTypes.hasAssignee.linkEntityTypeId,
      },
      {
        getLinkDestinationLinearIds: async (issue) => {
          const creator = await issue.creator;
          return { destinationLinearIds: creator ? [creator.id] : [] };
        },
        linkEntityTypeId: linearLinkEntityTypes.hasCreator.linkEntityTypeId,
      },
      {
        getLinkDestinationLinearIds: async (issue) => {
          const parent = await issue.parent;
          return { destinationLinearIds: parent ? [parent.id] : [] };
        },
        linkEntityTypeId: linearLinkEntityTypes.parent.linkEntityTypeId,
      },
      {
        getLinkDestinationLinearIds: async (issue) => {
          const snoozedBy = await issue.snoozedBy;
          return { destinationLinearIds: snoozedBy ? [snoozedBy.id] : [] };
        },
        linkEntityTypeId: linearLinkEntityTypes.snoozedBy.linkEntityTypeId,
      },
      /** @todo: add workflow state */
      {
        getLinkDestinationLinearIds: async (issue) => {
          let subscribers = await issue.subscribers();

          const destinationLinearIds = subscribers.nodes.map(({ id }) => id);

          while (subscribers.pageInfo.hasNextPage) {
            subscribers = await subscribers.fetchNext();

            destinationLinearIds.push(...subscribers.nodes.map(({ id }) => id));
          }

          return { destinationLinearIds };
        },
        linkEntityTypeId: linearLinkEntityTypes.snoozedBy.linkEntityTypeId,
      },
    ],
  } satisfies LinearMapping<"Issue">,
  {
    linearType: "User",
    hashEntityTypeId: linearEntityTypes.user.entityTypeId,
    propertyMappings: [
      {
        linearPropertyKey: "active",
        hashPropertyTypeId: linearPropertyTypes.active.propertyTypeId,
      } satisfies PropertyMapping<"User", "active">,
      {
        linearPropertyKey: "admin",
        hashPropertyTypeId: linearPropertyTypes.active.propertyTypeId,
      } satisfies PropertyMapping<"User", "admin">,
      {
        linearPropertyKey: "archivedAt",
        hashPropertyTypeId: linearPropertyTypes.archivedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"User", "archivedAt">,
      {
        linearPropertyKey: "avatarUrl",
        hashPropertyTypeId: linearPropertyTypes.avatarUrl.propertyTypeId,
      } satisfies PropertyMapping<"User", "avatarUrl">,
      {
        linearPropertyKey: "createdAt",
        hashPropertyTypeId: linearPropertyTypes.createdAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          mapLinearDateToIsoString(linearValue),
      } satisfies PropertyMapping<"User", "createdAt">,
      {
        linearPropertyKey: "createdIssueCount",
        hashPropertyTypeId:
          linearPropertyTypes.createdIssueCount.propertyTypeId,
      } satisfies PropertyMapping<"User", "createdIssueCount">,
      {
        linearPropertyKey: "description",
        hashPropertyTypeId:
          blockProtocolPropertyTypes.description.propertyTypeId,
      } satisfies PropertyMapping<"User", "description">,
      {
        linearPropertyKey: "email",
        hashPropertyTypeId: systemPropertyTypes.email.propertyTypeId,
      } satisfies PropertyMapping<"User", "email">,
      {
        linearPropertyKey: "name",
        hashPropertyTypeId: linearPropertyTypes.fullName.propertyTypeId,
      } satisfies PropertyMapping<"User", "name">,
      {
        linearPropertyKey: "guest",
        hashPropertyTypeId: linearPropertyTypes.guest.propertyTypeId,
      } satisfies PropertyMapping<"User", "guest">,
      {
        linearPropertyKey: "id",
        hashPropertyTypeId: linearPropertyTypes.id.propertyTypeId,
      } satisfies PropertyMapping<"User", "id">,
      {
        linearPropertyKey: "inviteHash",
        hashPropertyTypeId: linearPropertyTypes.inviteHash.propertyTypeId,
      } satisfies PropertyMapping<"User", "inviteHash">,
      {
        linearPropertyKey: "isMe",
        hashPropertyTypeId: linearPropertyTypes.isMe.propertyTypeId,
      } satisfies PropertyMapping<"User", "isMe">,
      {
        linearPropertyKey: "lastSeen",
        hashPropertyTypeId: linearPropertyTypes.lastSeen.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"User", "lastSeen">,
      {
        linearPropertyKey: "statusEmoji",
        hashPropertyTypeId: linearPropertyTypes.statusEmoji.propertyTypeId,
      } satisfies PropertyMapping<"User", "statusEmoji">,
      {
        linearPropertyKey: "statusLabel",
        hashPropertyTypeId: linearPropertyTypes.statusLabel.propertyTypeId,
      } satisfies PropertyMapping<"User", "statusLabel">,
      {
        linearPropertyKey: "statusUntilAt",
        hashPropertyTypeId: linearPropertyTypes.statusUntilAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"User", "statusUntilAt">,
      {
        linearPropertyKey: "timezone",
        hashPropertyTypeId: linearPropertyTypes.timezone.propertyTypeId,
      } satisfies PropertyMapping<"User", "timezone">,
      {
        linearPropertyKey: "updatedAt",
        hashPropertyTypeId: linearPropertyTypes.updatedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          mapLinearDateToIsoString(linearValue),
      } satisfies PropertyMapping<"User", "updatedAt">,
      {
        linearPropertyKey: "url",
        hashPropertyTypeId: linearPropertyTypes.profileUrl.propertyTypeId,
      } satisfies PropertyMapping<"User", "url">,
    ],
    outgoingLinkMappings: [
      {
        getLinkDestinationLinearIds: async (user) => {
          const organization = await user.organization;
          return { destinationLinearIds: [organization.id] };
        },
        linkEntityTypeId:
          linearLinkEntityTypes.belongsToOrganization.linkEntityTypeId,
      },
    ] satisfies LinearMapping<"User">["outgoingLinkMappings"],
  },
  {
    linearType: "Organization",
    hashEntityTypeId: linearEntityTypes.organization.entityTypeId,
    propertyMappings: [
      {
        linearPropertyKey: "allowedAuthServices",
        hashPropertyTypeId:
          linearPropertyTypes.allowedAuthService.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "allowedAuthServices">,
      {
        linearPropertyKey: "archivedAt",
        hashPropertyTypeId: linearPropertyTypes.archivedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Organization", "archivedAt">,
      {
        linearPropertyKey: "createdAt",
        hashPropertyTypeId: linearPropertyTypes.createdAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          mapLinearDateToIsoString(linearValue),
      } satisfies PropertyMapping<"Organization", "createdAt">,
      {
        linearPropertyKey: "createdIssueCount",
        hashPropertyTypeId:
          linearPropertyTypes.createdIssueCount.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "createdIssueCount">,
      {
        linearPropertyKey: "deletionRequestedAt",
        hashPropertyTypeId:
          linearPropertyTypes.deletionRequestedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Organization", "deletionRequestedAt">,
      {
        linearPropertyKey: "gitBranchFormat",
        hashPropertyTypeId: linearPropertyTypes.gitBranchFormat.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "gitBranchFormat">,
      {
        linearPropertyKey: "gitLinkbackMessagesEnabled",
        hashPropertyTypeId:
          linearPropertyTypes.gitLinkbackMessagesEnabled.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "gitLinkbackMessagesEnabled">,
      {
        linearPropertyKey: "gitPublicLinkbackMessagesEnabled",
        hashPropertyTypeId:
          linearPropertyTypes.gitPublicLinkbackMessagesEnabled.propertyTypeId,
      } satisfies PropertyMapping<
        "Organization",
        "gitPublicLinkbackMessagesEnabled"
      >,
      {
        linearPropertyKey: "id",
        hashPropertyTypeId: linearPropertyTypes.id.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "id">,
      {
        linearPropertyKey: "logoUrl",
        hashPropertyTypeId: linearPropertyTypes.logoUrl.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "logoUrl">,
      {
        linearPropertyKey: "name",
        hashPropertyTypeId: linearPropertyTypes.name.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "name">,
      {
        linearPropertyKey: "periodUploadVolume",
        hashPropertyTypeId:
          linearPropertyTypes.periodUploadVolume.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "periodUploadVolume">,
      {
        linearPropertyKey: "previousUrlKeys",
        hashPropertyTypeId: linearPropertyTypes.previousUrlKeys.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "previousUrlKeys">,
      {
        linearPropertyKey: "projectUpdateRemindersHour",
        hashPropertyTypeId:
          linearPropertyTypes.projectUpdateRemindersHour.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "projectUpdateRemindersHour">,
      {
        linearPropertyKey: "roadmapEnabled",
        hashPropertyTypeId: linearPropertyTypes.roadmapEnabled.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "roadmapEnabled">,
      {
        linearPropertyKey: "samlEnabled",
        hashPropertyTypeId: linearPropertyTypes.samlEnabled.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "samlEnabled">,
      {
        linearPropertyKey: "scimEnabled",
        hashPropertyTypeId: linearPropertyTypes.scimEnabled.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "scimEnabled">,
      {
        linearPropertyKey: "trialEndsAt",
        hashPropertyTypeId: linearPropertyTypes.trialEndsAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Organization", "trialEndsAt">,
      {
        linearPropertyKey: "updatedAt",
        hashPropertyTypeId: linearPropertyTypes.updatedAt.propertyTypeId,
        mapLinearValueToHashValue: (linearValue) =>
          mapLinearDateToIsoString(linearValue),
      } satisfies PropertyMapping<"Organization", "updatedAt">,
      {
        linearPropertyKey: "urlKey",
        hashPropertyTypeId: linearPropertyTypes.urlKey.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "urlKey">,
      {
        linearPropertyKey: "userCount",
        hashPropertyTypeId: linearPropertyTypes.urlKey.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "userCount">,
    ],
    outgoingLinkMappings: [],
  },
];

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
  const mapping = typeMappings.find(
    ({ linearType }) => linearType === params.linearType,
  ) as LinearMapping<T> | undefined;

  if (!mapping) {
    throw new Error(
      `Could not find mapping for linear type ${params.linearType}`,
    );
  }

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
    partialEntity: {
      entityTypeId: linearEntityTypes.issue.entityTypeId,
      properties,
    },
    outgoingLinks,
  };
};

// @todo avoid having to repeat each field in two places – have some object that translates between
//   Linear keys and HASH properties
export const entityPropertiesToIssueUpdate = (
  properties: EntityPropertiesObject,
): LinearDocument.IssueUpdateInput => {
  return {
    description: properties[
      extractBaseUrl(blockProtocolPropertyTypes.description.propertyTypeId)
    ] as string,
    dueDate:
      properties[extractBaseUrl(linearPropertyTypes.dueDate.propertyTypeId)],
    estimate: properties[
      extractBaseUrl(linearPropertyTypes.estimate.propertyTypeId)
    ] as number,
    priority: properties[
      extractBaseUrl(linearPropertyTypes.priority.propertyTypeId)
    ] as number,
    title: properties[
      extractBaseUrl(linearPropertyTypes.title.propertyTypeId)
    ] as string,
  };
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
