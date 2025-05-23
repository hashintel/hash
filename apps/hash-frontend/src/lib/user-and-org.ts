import type { EntityRootType, Subgraph } from "@blockprotocol/graph";
import {
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
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
  extractWebIdFromEntityId,
} from "@blockprotocol/type-system";
import { getFirstEntityRevision } from "@local/hash-isomorphic-utils/entity";
import type { FeatureFlag } from "@local/hash-isomorphic-utils/feature-flags";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type { ImageFile } from "@local/hash-isomorphic-utils/system-types/imagefile";
import type {
  HasBio,
  IsMemberOf,
  Organization,
  ProfileBio,
  ServiceAccount,
} from "@local/hash-isomorphic-utils/system-types/shared";
import type { User as UserEntity } from "@local/hash-isomorphic-utils/system-types/user";

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
  entity.metadata.entityTypeIds.includes(systemEntityTypes.user.entityTypeId);

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
};

export const isEntityOrgEntity = (
  entity: Entity,
): entity is Entity<Organization> =>
  entity.metadata.entityTypeIds.includes(
    systemEntityTypes.organization.entityTypeId,
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
  subgraph: Subgraph;
  orgEntity: Entity<Organization>;
}): Org => {
  const { subgraph, orgEntity } = params;

  const minimalOrg = constructMinimalOrg({
    orgEntity,
  });

  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter(({ linkEntity }) =>
    linkEntity[0]?.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
    ),
  );

  const hasAvatar = avatarLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: avatarLinkAndEntities[0].linkEntity[0]!,
        imageEntity: avatarLinkAndEntities[0]
          .rightEntity[0]! as Entity<ImageFile>,
      }
    : undefined;

  const hasBioLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter(({ linkEntity }) =>
    linkEntity[0]?.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasBio.linkEntityTypeId,
    ),
  );

  const hasBio = hasBioLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasBioLinkAndEntities[0].linkEntity[0]!,
        profileBioEntity: hasBioLinkAndEntities[0]
          .rightEntity[0]! as Entity<ProfileBio>,
      }
    : undefined;

  const orgMemberships = getIncomingLinksForEntity(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter((linkEntity): linkEntity is LinkEntity<IsMemberOf> =>
    linkEntity.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.isMemberOf.linkEntityTypeId,
    ),
  );

  const memberships = orgMemberships.map((linkEntity) => {
    const userEntityRevisions = getLeftEntityForLinkEntity(
      subgraph,
      linkEntity.metadata.recordId.entityId,
      intervalForTimestamp(currentTimestamp()),
    );

    if (!userEntityRevisions || userEntityRevisions.length === 0) {
      throw new Error(
        `Failed to find the current user entity associated with the membership with entity ID: ${linkEntity.metadata.recordId.entityId}`,
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
        `Entity with type(s) ${userEntity.metadata.entityTypeIds.join(", ")} is not a user entity`,
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
  subgraph: Subgraph<EntityRootType>;
  resolvedOrgs?: Org[];
  userEntity: Entity<UserEntity>;
}): User => {
  const { orgMembershipLinks, resolvedOrgs, subgraph, userEntity } = params;

  const { email } = simplifyProperties(userEntity.properties);

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- permissions means this may be undefined. @todo types to account for property-level permissions
  const primaryEmailAddress = email?.[0] ?? "";

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

  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter(({ linkEntity }) =>
    linkEntity[0]?.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasAvatar.linkEntityTypeId,
    ),
  );

  const hasAvatar = avatarLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: avatarLinkAndEntities[0].linkEntity[0]!,
        imageEntity: avatarLinkAndEntities[0]
          .rightEntity[0]! as Entity<ImageFile>,
      }
    : undefined;

  const coverImageLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter(({ linkEntity }) =>
    linkEntity[0]?.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasCoverImage.linkEntityTypeId,
    ),
  );

  const hasCoverImage = coverImageLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: coverImageLinkAndEntities[0].linkEntity[0]!,
        imageEntity: coverImageLinkAndEntities[0]
          .rightEntity[0]! as Entity<ImageFile>,
      }
    : undefined;

  const hasBioLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  ).filter(({ linkEntity }) =>
    linkEntity[0]?.metadata.entityTypeIds.includes(
      systemLinkEntityTypes.hasBio.linkEntityTypeId,
    ),
  );

  const hasBio = hasBioLinkAndEntities[0]
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasBioLinkAndEntities[0]
          .linkEntity[0]! as LinkEntity<HasBio>,
        profileBioEntity: hasBioLinkAndEntities[0]
          .rightEntity[0]! as Entity<ProfileBio>,
      }
    : undefined;

  const hasServiceAccounts = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(currentTimestamp()),
  )
    .filter(({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeIds.includes(
        systemLinkEntityTypes.hasServiceAccount.linkEntityTypeId,
      ),
    )
    .map<User["hasServiceAccounts"][number]>(({ linkEntity, rightEntity }) => {
      const serviceAccountEntity = rightEntity[0]!;

      const { profileUrl } = simplifyProperties(
        serviceAccountEntity.properties as ServiceAccount["properties"],
      );

      const kind = Object.entries(systemEntityTypes).find(([_, type]) =>
        serviceAccountEntity.metadata.entityTypeIds.includes(type.entityTypeId),
      )?.[0] as ServiceAccountKind;

      return {
        linkEntity: linkEntity[0]!,
        serviceAccountEntity,
        kind,
        profileUrl,
      };
    });

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
        verified: false,
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
