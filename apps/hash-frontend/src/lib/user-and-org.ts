import type {
  EntityRootType,
  LinkEntityAndRightEntity,
  Subgraph,
} from "@blockprotocol/graph";
import {
  getIncomingLinkAndSourceEntities,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  intervalCompareWithInterval,
  intervalForTimestamp,
} from "@blockprotocol/graph/stdlib";
import type {
  BaseUrl,
  Entity,
  LinkEntity,
  UserId,
  WebId,
} from "@blockprotocol/type-system";
import {
  currentTimestamp,
  extractBaseUrl,
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import type { HashEntity, HashLinkEntity } from "@local/hash-graph-sdk/entity";
import { getFirstEntityRevision } from "@local/hash-isomorphic-utils/entity";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  isInvitationByEmail,
  isInvitationByShortname,
} from "@local/hash-isomorphic-utils/organization";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { ImageFile } from "@local/hash-isomorphic-utils/system-types/imagefile";
import type {
  HasBio,
  InvitationViaEmail,
  InvitationViaShortname,
  IsMemberOf,
  Organization,
  ProfileBio,
  ServiceAccount,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { User as UserEntity } from "@local/hash-isomorphic-utils/system-types/user";
import type { VerifiableIdentityAddress } from "@ory/client";

import type { UserPreferences } from "../shared/use-user-preferences";

export const constructMinimalOrg = (params: {
  orgEntity: Entity<Organization>;
}): MinimalOrg => {
  const { orgEntity } = params;

  const { organizationName, pinnedEntityTypeBaseUrl, ...simpleProperties } =
    simplifyProperties(orgEntity.properties);

  return {
    kind: "org",
    entity: orgEntity,
    webId: extractWebIdFromEntityId(orgEntity.metadata.recordId.entityId),
    name: organizationName,
    ...(pinnedEntityTypeBaseUrl !== undefined
      ? {
          pinnedEntityTypeBaseUrls: pinnedEntityTypeBaseUrl as BaseUrl[],
        }
      : {}),
    ...simpleProperties,
  };
};

export type MinimalUser = {
  kind: "user";
  entity: Entity<UserEntity>;
  accountId: UserId;
  accountSignupComplete: boolean;
  enabledFeatureFlags: FeatureFlag[];
  pinnedEntityTypeBaseUrls?: BaseUrl[];
  shortname?: string;
  displayName?: string;
  preferredPronouns?: string;
  location?: string;
  websiteUrl?: string;
};

export const isEntityUserEntity = (
  entity: Entity,
): entity is Entity<UserEntity> =>
  entity.metadata.entityTypeIds.some(
    (entityTypeId) =>
      extractBaseUrl(entityTypeId) === systemEntityTypes.user.entityTypeBaseUrl,
  );

export const constructMinimalUser = (params: {
  userEntity: Entity<UserEntity>;
}): MinimalUser => {
  const { userEntity } = params;

  const simpleProperties = simplifyProperties(userEntity.properties);

  const { shortname, displayName, pinnedEntityTypeBaseUrl } = simpleProperties;

  const enabledFeatureFlags = (simpleProperties.enabledFeatureFlags ??
    []) as FeatureFlag[];

  const accountSignupComplete = !!shortname && !!displayName;

  return {
    kind: "user",
    entity: userEntity,
    // Cast reason: A user web's `WebId` is also their `UserId`
    accountId: extractWebIdFromEntityId(
      userEntity.metadata.recordId.entityId,
    ) as UserId,
    accountSignupComplete,
    ...simpleProperties,
    enabledFeatureFlags,
    ...(pinnedEntityTypeBaseUrl !== undefined
      ? {
          pinnedEntityTypeBaseUrls: pinnedEntityTypeBaseUrl as BaseUrl[],
        }
      : {}),
  };
};

export type Org = MinimalOrg & {
  createdAt: Date;
  hasAvatar?: {
    linkEntity: LinkEntity;
    imageEntity: Entity<ImageFile>;
  };
  hasBio?: {
    linkEntity: LinkEntity;
    profileBioEntity: Entity<ProfileBio>;
  };
  memberships: {
    linkEntity: LinkEntity<IsMemberOf>;
    user: MinimalUser;
  }[];
  invitations: {
    linkEntity: HashLinkEntity;
    invitationEntity:
      | HashEntity<InvitationViaEmail>
      | HashEntity<InvitationViaShortname>;
  }[];
};

export const isEntityOrgEntity = (
  entity: Entity,
): entity is Entity<Organization> =>
  entity.metadata.entityTypeIds.some(
    (entityTypeId) =>
      extractBaseUrl(entityTypeId) ===
      systemEntityTypes.organization.entityTypeBaseUrl,
  );

/**
 * Constructs a simplified org object from a subgraph.
 *
 * If the avatar is desired, the subgraph must have had the following depths available when traversing from the org
 *   -   hasLeftEntity: { incoming: 1 }
 *   -   hasRightEntity: { outgoing: 1 }
 *
 * If the memberships are desired, the subgraph must additionally have had the following depths available when traversing from the org
 *   -   hasLeftEntity: { outgoing: 1 }
 *   -   hasRightEntity: { incoming: 1 }
 */
export const constructOrg = (params: {
  subgraph: Subgraph<EntityRootType<HashEntity>>;
  orgEntity: Entity<Organization>;
}): Org => {
  const { subgraph, orgEntity } = params;

  const minimalOrg = constructMinimalOrg({
    orgEntity,
  });

  let hasAvatar: Org["hasAvatar"];
  let hasBio: Org["hasBio"];
  const memberships: Org["memberships"] = [];
  const invitations: Org["invitations"] = [];
  const outgoingLinkAndEntities = getOutgoingLinkAndTargetEntities<
    LinkEntityAndRightEntity<HashEntity, HashLinkEntity>[]
  >(subgraph, orgEntity.metadata.recordId.entityId);

  for (const { linkEntity, rightEntity } of outgoingLinkAndEntities) {
    const linkEntityRevision = linkEntity[0];

    if (!linkEntityRevision) {
      continue;
    }

    const rightEntityRevision = rightEntity[0];

    if (!rightEntityRevision) {
      continue;
    }

    if (
      linkEntityRevision.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
      )
    ) {
      hasAvatar = {
        linkEntity: linkEntityRevision,
        imageEntity: rightEntityRevision as HashEntity<ImageFile>,
      };
      continue;
    }

    if (
      linkEntityRevision.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.hasBio.linkEntityTypeId,
      )
    ) {
      hasBio = {
        linkEntity: linkEntityRevision,
        profileBioEntity: rightEntityRevision as HashEntity<ProfileBio>,
      };
      continue;
    }

    if (
      linkEntityRevision.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.hasIssuedInvitation.linkEntityTypeId,
      )
    ) {
      if (
        !isInvitationByEmail(rightEntityRevision) &&
        !isInvitationByShortname(rightEntityRevision)
      ) {
        throw new Error(
          `Entity linked from org via Has Issued Invitation with type(s) ${rightEntityRevision.metadata.entityTypeIds.join(
            ", ",
          )} is not an invitation entity`,
        );
      }

      invitations.push({
        linkEntity: linkEntityRevision,
        invitationEntity: rightEntityRevision,
      });

      continue;
    }
  }

  const incomingLinkAndEntities = getIncomingLinkAndSourceEntities(
    subgraph,
    orgEntity.metadata.recordId.entityId,
  );

  for (const { linkEntity, leftEntity } of incomingLinkAndEntities) {
    const linkEntityRevision = linkEntity[0];

    if (!linkEntityRevision) {
      continue;
    }

    if (
      !linkEntityRevision.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      )
    ) {
      continue;
    }

    const userEntityRevision = leftEntity[0];

    if (!userEntityRevision) {
      throw new Error(
        `Failed to find the current user entity associated with the membership with entity ID: ${linkEntityRevision.metadata.recordId.entityId}`,
      );
    }

    if (!isEntityUserEntity(userEntityRevision)) {
      throw new Error(
        `Entity with type(s) ${userEntityRevision.metadata.entityTypeIds.join(", ")} is not a user entity`,
      );
    }

    memberships.push({
      user: constructMinimalUser({ userEntity: userEntityRevision }),
      linkEntity: linkEntityRevision as LinkEntity<IsMemberOf>,
    });
  }

  const firstRevision = getFirstEntityRevision(
    subgraph,
    orgEntity.metadata.recordId.entityId,
  );

  const createdAt = new Date(
    firstRevision.metadata.temporalVersioning.decisionTime.start.limit,
  );

  return {
    ...minimalOrg,
    createdAt,
    hasAvatar,
    hasBio,
    invitations,
    memberships,
  };
};

export type ServiceAccountKind =
  | "linkedinAccount"
  | "twitterAccount"
  | "tiktokAccount"
  | "facebookAccount"
  | "instagramAccount"
  | "githubAccount";

export type UserServiceAccount = {
  linkEntity: LinkEntity;
  serviceAccountEntity: Entity;
  kind: ServiceAccountKind;
  profileUrl: string;
};

export type User = MinimalUser & {
  emails: { address: string; primary: boolean; verified: boolean }[];
  hasAvatar?: {
    linkEntity: LinkEntity;
    imageEntity: Entity<ImageFile>;
  };
  hasCoverImage?: {
    linkEntity: LinkEntity;
    imageEntity: Entity<ImageFile>;
  };
  hasBio?: {
    linkEntity: LinkEntity;
    profileBioEntity: Entity<ProfileBio>;
  };
  hasServiceAccounts: UserServiceAccount[];
  joinedAt: Date;
  memberOf: {
    linkEntity: LinkEntity;
    org: Org;
  }[];
  preferences?: UserPreferences;
};

/**
 * Constructs a user, including linked entities depending on the depth of the traversal rooted at the user which produced the subgraph.
 *
 * The following depths ensure that the user's avatar, org membership links and the orgs themselves are available.
 *
 *   -  hasLeftEntity: { incoming: 1 }, hasRightEntity: { outgoing: 1 }
 *
 * To include other things linked from or to the user's orgs (avatars, other members) either:
 *
 * 1. Pass orgs which have already been constructed as 'resolvedOrgs' to include these, or
 * 2. Pass a subgraph rooted at the user with traversal depths of:
 *   - hasLeftEntity: { incoming: 2, outgoing: 1 }, hasRightEntity: { outgoing: 2, incoming: 1 }
 *
 * @param params.orgMembershipLinks provides a minor optimization to avoid looking up membership links if they are already known
 */
export const constructUser = (params: {
  orgMembershipLinks?: LinkEntity[];
  subgraph: Subgraph<EntityRootType<HashEntity>>;
  resolvedOrgs?: Org[];
  userEntity: Entity<UserEntity>;
  verifiableAddresses?: VerifiableIdentityAddress[];
}): User => {
  const { orgMembershipLinks, resolvedOrgs, subgraph, userEntity } = params;

  const { email } = simplifyProperties(userEntity.properties);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- permissions means this may be undefined. @todo types to account for property-level permissions
  const primaryEmailAddress = email?.[0] ?? "";

  const isPrimaryEmailAddressVerified =
    params.verifiableAddresses?.find(
      ({ value }) => value === primaryEmailAddress,
    )?.verified === true;

  const minimalUser = constructMinimalUser({ userEntity });

  const orgMemberships =
    orgMembershipLinks ??
    getOutgoingLinksForEntity(
      subgraph,
      userEntity.metadata.recordId.entityId,
      intervalForTimestamp(currentTimestamp()),
    ).filter((linkEntity) =>
      linkEntity.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
      ),
    );

  const memberOf = orgMemberships.map((untypedLinkEntity) => {
    const linkEntity = untypedLinkEntity as LinkEntity<IsMemberOf>;

    const { linkData, metadata } = linkEntity;

    const fullyResolvedOrg = resolvedOrgs?.find(
      (org) => org.entity.metadata.recordId.entityId === linkData.rightEntityId,
    );
    if (fullyResolvedOrg) {
      return {
        linkEntity,
        org: fullyResolvedOrg,
      };
    }

    const orgEntityRevisions = getRightEntityForLinkEntity(
      subgraph,
      metadata.recordId.entityId,
      intervalForTimestamp(currentTimestamp()),
    );

    if (!orgEntityRevisions || orgEntityRevisions.length === 0) {
      throw new Error(
        `Failed to find the current org entity associated with the membership with entity ID: ${metadata.recordId.entityId}`,
      );
    }

    const variableAxis = subgraph.temporalAxes.resolved.variable.axis;
    orgEntityRevisions.sort((entityA, entityB) =>
      intervalCompareWithInterval(
        entityA.metadata.temporalVersioning[variableAxis],
        entityB.metadata.temporalVersioning[variableAxis],
      ),
    );
    const orgEntity = orgEntityRevisions.at(-1)!;

    if (!isEntityOrgEntity(orgEntity)) {
      throw new Error(
        `Entity with type(s) ${orgEntity.metadata.entityTypeIds.join(", ")} is not an org entity`,
      );
    }

    return {
      linkEntity,
      org: constructOrg({ subgraph, orgEntity }),
    };
  });

  const outgoingLinkAndTargetEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  );

  const avatarLinkAndEntities: LinkEntityAndRightEntity[] = [];
  const coverImageLinkAndEntities: LinkEntityAndRightEntity[] = [];
  const hasBioLinkAndEntities: LinkEntityAndRightEntity[] = [];
  const hasServiceAccounts: User["hasServiceAccounts"] = [];

  for (const linkAndEntity of outgoingLinkAndTargetEntities) {
    const linkEntity = linkAndEntity.linkEntity[0];
    const rightEntity = linkAndEntity.rightEntity[0];

    if (!linkEntity || !rightEntity) {
      continue;
    }

    const entityTypeIds = linkEntity.metadata.entityTypeIds;

    if (
      entityTypeIds.includes(systemLinkEntityTypes.hasAvatar.linkEntityTypeId)
    ) {
      avatarLinkAndEntities.push(linkAndEntity);
      continue;
    }

    if (
      entityTypeIds.includes(
        systemLinkEntityTypes.hasCoverImage.linkEntityTypeId,
      )
    ) {
      coverImageLinkAndEntities.push(linkAndEntity);
      continue;
    }

    if (entityTypeIds.includes(systemLinkEntityTypes.hasBio.linkEntityTypeId)) {
      hasBioLinkAndEntities.push(linkAndEntity);
      continue;
    }

    if (
      entityTypeIds.includes(
        systemLinkEntityTypes.hasServiceAccount.linkEntityTypeId,
      )
    ) {
      const serviceAccountEntity = linkAndEntity.rightEntity[0]!;

      const { profileUrl } = simplifyProperties(
        serviceAccountEntity.properties as ServiceAccount["properties"],
      );

      const kind = Object.entries(systemEntityTypes).find(([_, type]) =>
        serviceAccountEntity.metadata.entityTypeIds.includes(type.entityTypeId),
      )?.[0] as ServiceAccountKind;

      hasServiceAccounts.push({
        linkEntity,
        serviceAccountEntity,
        kind,
        profileUrl,
      });
    }
  }

  const hasAvatar = avatarLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: avatarLinkAndEntities[0].linkEntity[0]!,
        imageEntity: avatarLinkAndEntities[0]
          .rightEntity[0]! as Entity<ImageFile>,
      }
    : undefined;

  const hasCoverImage = coverImageLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: coverImageLinkAndEntities[0].linkEntity[0]!,
        imageEntity: coverImageLinkAndEntities[0]
          .rightEntity[0]! as Entity<ImageFile>,
      }
    : undefined;

  const hasBio = hasBioLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasBioLinkAndEntities[0]
          .linkEntity[0]! as LinkEntity<HasBio>,
        profileBioEntity: hasBioLinkAndEntities[0]
          .rightEntity[0]! as Entity<ProfileBio>,
      }
    : undefined;

  const joinedAt = new Date(
    userEntity.metadata.provenance.createdAtDecisionTime,
  );

  return {
    ...minimalUser,
    hasAvatar,
    hasBio,
    hasCoverImage,
    hasServiceAccounts,
    joinedAt,
    memberOf,
    preferences: userEntity.properties[
      "https://hash.ai/@h/types/property-type/application-preferences/"
    ] as UserPreferences | undefined,
    emails: [
      {
        address: primaryEmailAddress,
        verified: isPrimaryEmailAddressVerified,
        primary: true,
      },
    ],
  };
};

export type MinimalOrg = {
  kind: "org";
  entity: Entity;
  webId: WebId;
  pinnedEntityTypeBaseUrls?: BaseUrl[];
  description?: string;
  location?: string;
  name: string;
  shortname: string;
  websiteUrl?: string;
};

export const isUser = (
  userOrOrg: MinimalUser | MinimalOrg,
): userOrOrg is MinimalUser => "accountId" in userOrOrg;

export const isOrg = (
  userOrOrg: MinimalUser | MinimalOrg,
): userOrOrg is MinimalOrg => "accountGroupId" in userOrOrg;

export const extractWebId = (userOrOrg: MinimalUser | MinimalOrg): WebId =>
  isUser(userOrOrg) ? userOrOrg.accountId : userOrOrg.webId;
