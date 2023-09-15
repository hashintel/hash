import { types } from "@local/hash-isomorphic-utils/ontology-types";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { Image } from "@local/hash-isomorphic-utils/system-types/imagefile";
import {
  OrgMembershipProperties,
  OrgProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/shared";
import {
  AccountEntityId,
  AccountGroupEntityId,
  AccountGroupId,
  AccountId,
  Entity,
  EntityRecordId,
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
  getRoots,
  intervalCompareWithInterval,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";
import { LinkEntity } from "@local/hash-subgraph/type-system-patch";

export const constructMinimalOrg = (params: {
  orgEntity: Entity<OrgProperties>;
}): MinimalOrg => {
  const { orgEntity } = params;

  const {
    description,
    location,
    organizationName: name,
    shortname,
    website,
  } = simplifyProperties(orgEntity.properties);

  return {
    kind: "org",
    entityRecordId: orgEntity.metadata.recordId,
    accountGroupId: extractAccountGroupId(
      orgEntity.metadata.recordId.entityId as AccountGroupEntityId,
    ),
    description,
    location,
    shortname,
    name,
    website,
  };
};

export type MinimalUser = {
  kind: "user";
  entityRecordId: EntityRecordId;
  accountId: AccountId;
  accountSignupComplete: boolean;
  shortname?: string;
  preferredName?: string;
};

export const constructMinimalUser = (params: {
  userEntity: Entity<UserProperties>;
}): MinimalUser => {
  const { userEntity } = params;

  const { shortname, preferredName } = simplifyProperties(
    userEntity.properties,
  );

  const accountSignupComplete = !!shortname && !!preferredName;

  return {
    kind: "user",
    entityRecordId: userEntity.metadata.recordId,
    // Cast reason: The EntityUuid of a User's baseId is an AccountId
    accountId: extractAccountId(
      userEntity.metadata.recordId.entityId as AccountEntityId,
    ),
    shortname,
    preferredName,
    accountSignupComplete,
  };
};

export type Org = MinimalOrg & {
  hasAvatar?: {
    linkEntity: LinkEntity;
    imageEntity: Image;
  };
  memberships: {
    linkEntity: Entity<OrgMembershipProperties>;
    user: MinimalUser;
  }[];
};

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
  orgEntity: Entity<OrgProperties>;
}): Org => {
  const { subgraph, orgEntity } = params;

  const org = constructMinimalOrg({
    orgEntity,
  }) as Org;

  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      types.linkEntityType.hasAvatar.linkEntityTypeId,
  );

  const hasAvatar = avatarLinkAndEntities[0];

  org.hasAvatar = hasAvatar
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasAvatar.linkEntity[0] as LinkEntity,
        imageEntity: hasAvatar.rightEntity[0] as unknown as Image,
      }
    : undefined;

  const orgMemberships = getIncomingLinksForEntity(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  ) as Entity<OrgMembershipProperties>[];

  org.memberships = orgMemberships.map((linkEntity) => {
    const { linkData, metadata } = linkEntity;

    if (!linkData?.leftEntityId) {
      throw new Error("Expected org membership to contain a left entity");
    }
    const userEntityRevisions = getLeftEntityForLinkEntity(
      subgraph,
      metadata.recordId.entityId,
      intervalForTimestamp(new Date().toISOString() as Timestamp),
    ) as Entity<UserProperties>[] | undefined;

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

    return {
      user: constructMinimalUser({
        userEntity,
      }),
      linkEntity,
    };
  });

  return org;
};

export type User = MinimalUser & {
  hasAvatar?: {
    linkEntity: LinkEntity;
    imageEntity: Image;
  };
  memberOf: {
    linkEntity: Entity<OrgMembershipProperties>;
    org: Org;
  }[];
};

export type AuthenticatedUser = User & {
  isInstanceAdmin: boolean;
  emails: { address: string; primary: boolean; verified: boolean }[];
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
 * 1. Pass an org which has already been constructed to include these, or
 * 2. Pass a subgraph rooted at the user with traversal depths of:
 *   - hasLeftEntity: { incoming: 2, outgoing: 1 }, hasRightEntity: { outgoing: 2, incoming: 1 }
 *
 * @param params.orgMembershipLinks provides a minor optimization to avoid looking up these links if they are already known.
 */
export const constructUser = (params: {
  orgMembershipLinks?: LinkEntity[];
  subgraph: Subgraph<EntityRootType>;
  resolvedOrgs?: Org[];
}): AuthenticatedUser => {
  const { orgMembershipLinks, resolvedOrgs, subgraph } = params;

  const userEntity = getRoots(subgraph)[0] as Entity<UserProperties>;

  const { email } = simplifyProperties(userEntity.properties);

  const primaryEmailAddress = email[0];

  // @todo implement email verification
  // const isPrimaryEmailAddressVerified =
  //   params.kratosSession.identity.verifiable_addresses?.find(
  //     ({ value }) => value === primaryEmailAddress,
  //   )?.verified === true;

  const user = constructMinimalUser({ userEntity }) as User;

  const orgMemberships =
    orgMembershipLinks ??
    getOutgoingLinksForEntity(
      subgraph,
      userEntity.metadata.recordId.entityId,
      intervalForTimestamp(new Date().toISOString() as Timestamp),
    ).filter(
      (linkEntity) =>
        linkEntity.metadata.entityTypeId ===
        types.linkEntityType.orgMembership.linkEntityTypeId,
    );

  user.memberOf = orgMemberships.map((linkEntity) => {
    const { linkData, metadata } = linkEntity;

    if (!linkData?.rightEntityId) {
      throw new Error("Expected org membership to contain a right entity");
    }

    const fullyResolvedOrg = resolvedOrgs?.find(
      (org) => org.entityRecordId.entityId === linkData.rightEntityId,
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
    ) as Entity<OrgProperties>[] | undefined;

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

    return {
      linkEntity,
      org: constructOrg({
        subgraph,
        orgEntity,
      }),
    };
  });

  const avatarLinkAndEntities = getOutgoingLinkAndTargetEntities(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    ({ linkEntity }) =>
      linkEntity[0]?.metadata.entityTypeId ===
      types.linkEntityType.hasAvatar.linkEntityTypeId,
  );

  const hasAvatar = avatarLinkAndEntities[0];

  user.hasAvatar = hasAvatar
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasAvatar.linkEntity[0] as LinkEntity,
        imageEntity: hasAvatar.rightEntity[0] as unknown as Image,
      }
    : undefined;

  /**
   * @todo: determine whether an authenticated user is an instance admin from the subgraph
   * when querying the incoming links of an entity rooted subgraph is supported
   *
   * @see https://app.asana.com/0/1202805690238892/1203250435416416/f
   */
  const isInstanceAdmin = false;

  return {
    ...user,
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
  entityRecordId: EntityRecordId;
  accountGroupId: AccountGroupId;
  description?: string;
  location?: string;
  name: string;
  shortname: string;
  website?: string;
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
