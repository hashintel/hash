import { getFirstEntityRevision } from "@local/hash-isomorphic-utils/entity";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { Image } from "@local/hash-isomorphic-utils/system-types/image";
import {
  IsMemberOfProperties,
  OrganizationProperties,
  ProfileBioProperties,
  ServiceAccountProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountEntityId,
  AccountGroupEntityId,
  AccountGroupId,
  AccountId,
  BaseUrl,
  Entity,
  EntityRootType,
  extractAccountGroupId,
  extractAccountId,
  OwnedById,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import {
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinkAndTargetEntities,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  intervalCompareWithInterval,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

export const constructMinimalOrg = (params: {
  orgEntity: Entity<OrganizationProperties>;
}): MinimalOrg => {
  const { orgEntity } = params;

  const { organizationName, pinnedEntityTypeBaseUrl, ...simpleProperties } =
    simplifyProperties(orgEntity.properties);

  return {
    kind: "org",
    entity: orgEntity,
    accountGroupId: extractAccountGroupId(
      orgEntity.metadata.recordId.entityId as AccountGroupEntityId,
    ),
    name: organizationName,
    ...(pinnedEntityTypeBaseUrl
      ? {
          pinnedEntityTypeBaseUrls: pinnedEntityTypeBaseUrl as BaseUrl[],
        }
      : {}),
    ...simpleProperties,
  };
};

export type MinimalUser = {
  kind: "user";
  entity: Entity;
  accountId: AccountId;
  accountSignupComplete: boolean;
  pinnedEntityTypeBaseUrls?: BaseUrl[];
  shortname?: string;
  preferredName?: string;
  preferredPronouns?: string;
  location?: string;
  websiteUrl?: string;
};

export const isEntityUserEntity = (
  entity: Entity,
): entity is Entity<UserProperties> =>
  entity.metadata.entityTypeId === systemEntityTypes.user.entityTypeId;

export const constructMinimalUser = (params: {
  userEntity: Entity<UserProperties>;
}): MinimalUser => {
  const { userEntity } = params;

  const simpleProperties = simplifyProperties(userEntity.properties);

  const { shortname, preferredName, pinnedEntityTypeBaseUrl } =
    simpleProperties;

  const accountSignupComplete = !!shortname && !!preferredName;

  return {
    kind: "user",
    entity: userEntity,
    // Cast reason: The EntityUuid of a User's baseId is an AccountId
    accountId: extractAccountId(
      userEntity.metadata.recordId.entityId as AccountEntityId,
    ),
    accountSignupComplete,
    ...(pinnedEntityTypeBaseUrl
      ? {
          pinnedEntityTypeBaseUrls: pinnedEntityTypeBaseUrl as BaseUrl[],
        }
      : {}),
    ...simpleProperties,
  };
};

export type Org = MinimalOrg & {
  createdAt: Date;
  hasAvatar?: {
    linkEntity: LinkEntity;
    imageEntity: Image;
  };
  hasBio?: {
    linkEntity: LinkEntity;
    profileBioEntity: Entity<ProfileBioProperties>;
  };
  memberships: {
    linkEntity: Entity<IsMemberOfProperties>;
    user: MinimalUser;
  }[];
};

export const isEntityOrgEntity = (
  entity: Entity,
): entity is Entity<OrganizationProperties> =>
  entity.metadata.entityTypeId === systemEntityTypes.organization.entityTypeId;

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
  subgraph: Subgraph;
  orgEntity: Entity<OrganizationProperties>;
}): Org => {
  const { subgraph, orgEntity } = params;

  const minimalOrg = constructMinimalOrg({
    orgEntity,
  });

  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
  );

  const hasAvatar = avatarLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: avatarLinkAndEntities[0].linkEntity[0] as LinkEntity,
        imageEntity: avatarLinkAndEntities[0]
          .rightEntity[0] as unknown as Image,
      }
    : undefined;

  const hasBioLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasBio.linkEntityTypeId,
  );

  const hasBio = hasBioLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasBioLinkAndEntities[0].linkEntity[0] as LinkEntity,
        profileBioEntity: hasBioLinkAndEntities[0].rightEntity[0]!,
      }
    : undefined;

  const orgMemberships = getIncomingLinksForEntity(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    (linkEntity): linkEntity is Entity<IsMemberOfProperties> =>
      linkEntity.metadata.entityTypeId ===
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
  );

  const memberships = orgMemberships.map((linkEntity) => {
    const { linkData, metadata } = linkEntity;

    if (!linkData?.leftEntityId) {
      throw new Error("Expected org membership to contain a left entity");
    }
    const userEntityRevisions = getLeftEntityForLinkEntity(
      subgraph,
      metadata.recordId.entityId,
      intervalForTimestamp(new Date().toISOString() as Timestamp),
    );

    if (!userEntityRevisions || userEntityRevisions.length === 0) {
      throw new Error(
        `Failed to find the current user entity associated with the membership with entity ID: ${metadata.recordId.entityId}`,
      );
    }

    const variableAxis = subgraph.temporalAxes.resolved.variable.axis;
    userEntityRevisions.sort((entityA, entityB) =>
      intervalCompareWithInterval(
        entityA.metadata.temporalVersioning[variableAxis],
        entityB.metadata.temporalVersioning[variableAxis],
      ),
    );
    const userEntity = userEntityRevisions.at(-1)!;

    if (!isEntityUserEntity(userEntity)) {
      throw new Error(
        `Entity with type ${userEntity.metadata.entityTypeId} is not a user entity`,
      );
    }

    return {
      user: constructMinimalUser({ userEntity }),
      linkEntity,
    };
  });

  const firstRevision = getFirstEntityRevision(
    subgraph,
    orgEntity.metadata.recordId.entityId,
  );

  const createdAt = new Date(
    firstRevision.metadata.temporalVersioning.decisionTime.start.limit,
  );

  return { ...minimalOrg, createdAt, hasAvatar, memberships, hasBio };
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
  joinedAt: Date;
  emails: { address: string; primary: boolean; verified: boolean }[];
  hasAvatar?: {
    linkEntity: LinkEntity;
    imageEntity: Image;
  };
  hasCoverImage?: {
    linkEntity: LinkEntity;
    imageEntity: Image;
  };
  hasBio?: {
    linkEntity: LinkEntity;
    profileBioEntity: Entity<ProfileBioProperties>;
  };
  hasServiceAccounts: UserServiceAccount[];
  isInstanceAdmin: boolean;
  memberOf: {
    linkEntity: Entity<IsMemberOfProperties>;
    org: Org;
  }[];
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
  subgraph: Subgraph<EntityRootType>;
  resolvedOrgs?: Org[];
  userEntity: Entity<UserProperties>;
}): User => {
  const { orgMembershipLinks, resolvedOrgs, subgraph, userEntity } = params;

  const { email } = simplifyProperties(userEntity.properties);

  const primaryEmailAddress = email[0];

  // @todo implement email verification
  // const isPrimaryEmailAddressVerified =
  //   params.kratosSession.identity.verifiable_addresses?.find(
  //     ({ value }) => value === primaryEmailAddress,
  //   )?.verified === true;

  const minimalUser = constructMinimalUser({ userEntity });

  const orgMemberships =
    orgMembershipLinks ??
    getOutgoingLinksForEntity(
      subgraph,
      userEntity.metadata.recordId.entityId,
      intervalForTimestamp(new Date().toISOString() as Timestamp),
    ).filter(
      (linkEntity) =>
        linkEntity.metadata.entityTypeId ===
        systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
    );

  const memberOf = orgMemberships.map((linkEntity) => {
    const { linkData, metadata } = linkEntity;

    if (!linkData?.rightEntityId) {
      throw new Error("Expected org membership to contain a right entity");
    }

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
      intervalForTimestamp(new Date().toISOString() as Timestamp),
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
        `Entity with type ${orgEntity.metadata.entityTypeId} is not an org entity`,
      );
    }

    return {
      linkEntity,
      org: constructOrg({ subgraph, orgEntity }),
    };
  });

  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
  );

  const hasAvatar = avatarLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: avatarLinkAndEntities[0].linkEntity[0] as LinkEntity,
        imageEntity: avatarLinkAndEntities[0]
          .rightEntity[0] as unknown as Image,
      }
    : undefined;

  const coverImageLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasCoverImage.linkEntityTypeId,
  );

  const hasCoverImage = coverImageLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: coverImageLinkAndEntities[0].linkEntity[0] as LinkEntity,
        imageEntity: coverImageLinkAndEntities[0]
          .rightEntity[0] as unknown as Image,
      }
    : undefined;

  const hasBioLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      systemLinkEntityTypes.hasBio.linkEntityTypeId,
  );

  const hasBio = hasBioLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasBioLinkAndEntities[0].linkEntity[0] as LinkEntity,
        profileBioEntity: hasBioLinkAndEntities[0].rightEntity[0]!,
      }
    : undefined;

  const hasServiceAccounts = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  )
    .filter(
      ({ linkEntity }) =>
        linkEntity[0]?.metadata.entityTypeId ===
        systemLinkEntityTypes.hasServiceAccount.linkEntityTypeId,
    )
    .map<User["hasServiceAccounts"][number]>(({ linkEntity, rightEntity }) => {
      const serviceAccountEntity = rightEntity[0]!;

      const { profileUrl } = simplifyProperties(
        serviceAccountEntity.properties as ServiceAccountProperties,
      );

      const kind = Object.entries(systemEntityTypes).find(
        ([_, type]) =>
          type.entityTypeId === serviceAccountEntity.metadata.entityTypeId,
      )?.[0] as ServiceAccountKind;

      return {
        linkEntity: linkEntity[0] as LinkEntity,
        serviceAccountEntity,
        kind,
        profileUrl,
      };
    });

  /**
   * @todo: determine whether a user is an instance admin from the subgraph
   */
  const isInstanceAdmin = false;

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
    isInstanceAdmin,
    emails: [
      {
        address: primaryEmailAddress,
        verified: false,
        primary: true,
      },
    ],
  };
};

export type MinimalOrg = {
  kind: "org";
  entity: Entity;
  accountGroupId: AccountGroupId;
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

export const extractOwnedById = (
  userOrOrg: MinimalUser | MinimalOrg,
): OwnedById =>
  isUser(userOrOrg)
    ? (userOrOrg.accountId as OwnedById)
    : (userOrOrg.accountGroupId as OwnedById);
