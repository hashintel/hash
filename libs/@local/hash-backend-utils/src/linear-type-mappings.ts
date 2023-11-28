/* eslint-disable no-param-reassign */
import { VersionedUrl } from "@blockprotocol/type-system";
import { Issue, Organization, User } from "@linear/sdk";
import {
  IssueUpdateInput,
  UpdateOrganizationInput,
  UpdateUserInput,
  // eslint-disable-next-line import/no-unresolved
} from "@linear/sdk/dist/_generated_documents";
import {
  blockProtocolPropertyTypes,
  linearEntityTypes,
  linearLinkEntityTypes,
  linearPropertyTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { BaseUrl, Entity, EntityPropertyValue } from "@local/hash-subgraph";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

const mapLinearDateToIsoString = (date: string | Date): string => {
  if (typeof date === "string") {
    return date;
  }
  return date.toISOString();
};

export type SupportedLinearTypes = {
  Issue: Issue;
  User: User;
  Organization: Organization;
};

export type SupportedLinearUpdateInput = {
  Issue: IssueUpdateInput;
  User: UpdateUserInput;
  Organization: UpdateOrganizationInput;
};

export type SupportedLinearTypeNames = keyof SupportedLinearTypes;

const getLinearIdFromEntity = (entity: Entity): string => {
  const linearId =
    entity.properties[linearPropertyTypes.id.propertyTypeBaseUrl as BaseUrl];

  if (!linearId) {
    throw new Error(
      `Could not get linear ID from entity with ID "${entity.metadata.recordId.entityId}"`,
    );
  } else if (typeof linearId !== "string") {
    throw new Error(
      `Linear ID from entity with ID "${entity.metadata.recordId.entityId}" is not a string`,
    );
  }

  return linearId;
};

type PropertyMapping<
  LinearType extends SupportedLinearTypeNames,
  Key extends keyof SupportedLinearTypes[LinearType],
  HashPropertyValue extends EntityPropertyValue = EntityPropertyValue,
> = {
  linearPropertyKey: Key;
  hashPropertyTypeId: VersionedUrl;
  addHashValueToLinearUpdateInput?: (
    updateInput: SupportedLinearUpdateInput[LinearType],
    hashValue: HashPropertyValue,
  ) => SupportedLinearUpdateInput[LinearType];
  mapLinearValueToHashValue?: (
    linearValue: SupportedLinearTypes[LinearType][Key],
  ) => HashPropertyValue | undefined;
};

type OutgoingLinkMapping<
  LinearType extends SupportedLinearTypeNames = SupportedLinearTypeNames,
> = {
  getLinkDestinationLinearIds: (
    linearData: SupportedLinearTypes[LinearType],
  ) => Promise<{ destinationLinearIds: string[] }>;
  addToLinearUpdateInput?: (
    updateInput: SupportedLinearUpdateInput[LinearType],
    matchingOutgoingLinks: { linkEntity: LinkEntity; rightEntity: Entity }[],
  ) => SupportedLinearUpdateInput[LinearType];
  linkEntityTypeId: VersionedUrl;
};

type LinearMapping<
  T extends SupportedLinearTypeNames = SupportedLinearTypeNames,
> = {
  linearType: T;
  hashEntityTypeId: VersionedUrl;
  propertyMappings: PropertyMapping<T, keyof SupportedLinearTypes[T]>[];
  outgoingLinkMappings: OutgoingLinkMapping<T>[];
};

export const linearTypeMappings = [
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.description = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"Issue", "description">,
      {
        linearPropertyKey: "dueDate",
        hashPropertyTypeId: linearPropertyTypes.dueDate.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.dueDate = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"Issue", "dueDate">,
      {
        linearPropertyKey: "estimate",
        hashPropertyTypeId: linearPropertyTypes.estimate.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.estimate = hashValue as number;
          return updateInput;
        },
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
        /** @todo: consider defaulting to `priority` */
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.priority = hashValue as number;
          return updateInput;
        },
      } satisfies PropertyMapping<"Issue", "priority">,
      {
        linearPropertyKey: "priorityLabel",
        hashPropertyTypeId: linearPropertyTypes.priorityLabel.propertyTypeId,
      } satisfies PropertyMapping<"Issue", "priorityLabel">,
      {
        linearPropertyKey: "snoozedUntilAt",
        hashPropertyTypeId: linearPropertyTypes.snoozedUntilAt.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.snoozedUntilAt = new Date(hashValue as string);
          return updateInput;
        },
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"Issue", "snoozedUntilAt">,
      {
        linearPropertyKey: "sortOrder",
        hashPropertyTypeId: linearPropertyTypes.sortOrder.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.sortOrder = hashValue as number;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.subIssueSortOrder = hashValue as number;
          return updateInput;
        },
      } satisfies PropertyMapping<"Issue", "subIssueSortOrder">,
      {
        linearPropertyKey: "title",
        hashPropertyTypeId: linearPropertyTypes.title.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.title = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"Issue", "title">,
      {
        linearPropertyKey: "trashed",
        hashPropertyTypeId: linearPropertyTypes.trashed.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.trashed = hashValue as boolean;
          return updateInput;
        },
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
        addToLinearUpdateInput: (updateInput, matchingOutgoingLinks) => {
          const [matchingOutgoingLink] = matchingOutgoingLinks;

          if (matchingOutgoingLink) {
            const linearId = getLinearIdFromEntity(
              matchingOutgoingLink.rightEntity,
            );

            updateInput.assigneeId = linearId;
          } else {
            updateInput.assigneeId = null;
          }

          return updateInput;
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
        addToLinearUpdateInput: (updateInput, matchingOutgoingLinks) => {
          const [matchingOutgoingLink] = matchingOutgoingLinks;

          if (matchingOutgoingLink) {
            const linearId = getLinearIdFromEntity(
              matchingOutgoingLink.rightEntity,
            );

            updateInput.parentId = linearId;
          } else {
            updateInput.parentId = null;
          }

          return updateInput;
        },
        linkEntityTypeId: linearLinkEntityTypes.parent.linkEntityTypeId,
      },
      {
        getLinkDestinationLinearIds: async (issue) => {
          const snoozedBy = await issue.snoozedBy;
          return { destinationLinearIds: snoozedBy ? [snoozedBy.id] : [] };
        },
        addToLinearUpdateInput: (updateInput, matchingOutgoingLinks) => {
          const [matchingOutgoingLink] = matchingOutgoingLinks;

          if (matchingOutgoingLink) {
            const linearId = getLinearIdFromEntity(
              matchingOutgoingLink.rightEntity,
            );

            updateInput.snoozedById = linearId;
          } else {
            updateInput.snoozedById = null;
          }

          return updateInput;
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
        addToLinearUpdateInput: (updateInput, matchingOutgoingLinks) => {
          updateInput.subscriberIds = matchingOutgoingLinks.map(
            ({ rightEntity }) => getLinearIdFromEntity(rightEntity),
          );

          return updateInput;
        },
        linkEntityTypeId: linearLinkEntityTypes.hasSubscriber.linkEntityTypeId,
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.active = hashValue as boolean;
          return updateInput;
        },
      } satisfies PropertyMapping<"User", "active">,
      {
        linearPropertyKey: "admin",
        hashPropertyTypeId: linearPropertyTypes.admin.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.admin = hashValue as boolean;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.avatarUrl = hashValue as string;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.description = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"User", "description">,
      {
        linearPropertyKey: "displayName",
        hashPropertyTypeId: linearPropertyTypes.displayName.propertyTypeId,
      } satisfies PropertyMapping<"User", "displayName">,
      {
        linearPropertyKey: "email",
        hashPropertyTypeId: systemPropertyTypes.email.propertyTypeId,
      } satisfies PropertyMapping<"User", "email">,
      {
        linearPropertyKey: "name",
        hashPropertyTypeId: linearPropertyTypes.fullName.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.name = hashValue as string;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.statusEmoji = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"User", "statusEmoji">,
      {
        linearPropertyKey: "statusLabel",
        hashPropertyTypeId: linearPropertyTypes.statusLabel.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.statusLabel = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"User", "statusLabel">,
      {
        linearPropertyKey: "statusUntilAt",
        hashPropertyTypeId: linearPropertyTypes.statusUntilAt.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.statusUntilAt = new Date(hashValue as string);
          return updateInput;
        },
        mapLinearValueToHashValue: (linearValue) =>
          linearValue ? mapLinearDateToIsoString(linearValue) : undefined,
      } satisfies PropertyMapping<"User", "statusUntilAt">,
      {
        linearPropertyKey: "timezone",
        hashPropertyTypeId: linearPropertyTypes.timezone.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.timezone = hashValue as string;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.allowedAuthServices = hashValue as string[];
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.gitBranchFormat = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"Organization", "gitBranchFormat">,
      {
        linearPropertyKey: "gitLinkbackMessagesEnabled",
        hashPropertyTypeId:
          linearPropertyTypes.gitLinkbackMessagesEnabled.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.gitLinkbackMessagesEnabled = hashValue as boolean;
          return updateInput;
        },
      } satisfies PropertyMapping<"Organization", "gitLinkbackMessagesEnabled">,
      {
        linearPropertyKey: "gitPublicLinkbackMessagesEnabled",
        hashPropertyTypeId:
          linearPropertyTypes.gitPublicLinkbackMessagesEnabled.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.gitPublicLinkbackMessagesEnabled = hashValue as boolean;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.logoUrl = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"Organization", "logoUrl">,
      {
        linearPropertyKey: "name",
        hashPropertyTypeId: linearPropertyTypes.name.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.name = hashValue as string;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.projectUpdateRemindersHour = hashValue as number;
          return updateInput;
        },
      } satisfies PropertyMapping<"Organization", "projectUpdateRemindersHour">,
      {
        linearPropertyKey: "roadmapEnabled",
        hashPropertyTypeId: linearPropertyTypes.roadmapEnabled.propertyTypeId,
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.roadmapEnabled = hashValue as boolean;
          return updateInput;
        },
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
        addHashValueToLinearUpdateInput: (updateInput, hashValue) => {
          updateInput.urlKey = hashValue as string;
          return updateInput;
        },
      } satisfies PropertyMapping<"Organization", "urlKey">,
      {
        linearPropertyKey: "userCount",
        hashPropertyTypeId: linearPropertyTypes.userCount.propertyTypeId,
      } satisfies PropertyMapping<"Organization", "userCount">,
    ],
    outgoingLinkMappings: [],
  },
];

export const getLinearMappingByHashEntityTypeId = (params: {
  entityTypeId: VersionedUrl;
}): LinearMapping => {
  const mapping = linearTypeMappings.find(
    ({ hashEntityTypeId }) => hashEntityTypeId === params.entityTypeId,
  ) as LinearMapping | undefined;

  if (!mapping) {
    throw new Error(
      `Could not find mapping for HASH entity type ID ${params.entityTypeId}`,
    );
  }

  return mapping;
};

export const getLinearMappingByLinearType = <
  T extends SupportedLinearTypeNames = SupportedLinearTypeNames,
>(params: {
  linearType: T;
}): LinearMapping<T> => {
  const mapping = linearTypeMappings.find(
    ({ linearType }) => linearType === params.linearType,
  ) as LinearMapping<T> | undefined;

  if (!mapping) {
    throw new Error(
      `Could not find mapping for linear type ${params.linearType}`,
    );
  }

  return mapping;
};
