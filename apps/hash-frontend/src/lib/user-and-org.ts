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
  EntityRecordIdString,
  entityRecordIdToString,
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
import { Session } from "@ory/client";

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

export type User = MinimalUser & {
  memberOf: Org[];
};

export const constructUser = (params: {
  subgraph: Subgraph;
  userEntity: Entity<UserProperties>;
  resolvedUsers?: Record<EntityRecordIdString, User>;
  resolvedOrgs?: Record<EntityRecordIdString, Org>;
}): User => {
  const { userEntity, subgraph } = params;

  const resolvedUsers = params.resolvedUsers ?? {};
  const resolvedOrgs = params.resolvedOrgs ?? {};

  const orgMemberships = getOutgoingLinksForEntity(
    subgraph,
    userEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  );

  const user = constructMinimalUser({ userEntity }) as User;

  // We add it to resolved users *before* fully creating so that when we're traversing we know
  // we already encountered it and avoid infinite recursion
  resolvedUsers[entityRecordIdToString(user.entityRecordId)] = user;

  user.memberOf = orgMemberships.map(({ linkData, metadata }) => {
    if (!linkData?.rightEntityId) {
      throw new Error("Expected org membership to contain a right entity");
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

    let org = resolvedOrgs[entityRecordIdToString(orgEntity.metadata.recordId)];

    if (!org) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      org = constructOrg({
        subgraph,
        orgEntity,
        resolvedUsers,
        resolvedOrgs,
      });

      resolvedOrgs[entityRecordIdToString(org.entityRecordId)] = org;
    }

    return org;
  });

  return user;
};

export type AuthenticatedUser = User & {
  isInstanceAdmin: boolean;
  emails: { address: string; primary: boolean; verified: boolean }[];
};

export const constructAuthenticatedUser = (params: {
  userEntity: Entity<UserProperties>;
  subgraph: Subgraph;
  kratosSession: Session;
}): AuthenticatedUser => {
  const { userEntity, subgraph } = params;

  const { email } = simplifyProperties(userEntity.properties);

  const primaryEmailAddress = email[0];

  const isPrimaryEmailAddressVerified =
    params.kratosSession.identity.verifiable_addresses?.find(
      ({ value }) => value === primaryEmailAddress,
    )?.verified === true;

  /**
   * @todo: determine whether an authenticated user is an instance admin from the subgraph
   * when querying the incoming links of an entity rooted subgraph is supported
   *
   * @see https://app.asana.com/0/1202805690238892/1203250435416416/f
   */
  const isInstanceAdmin = false;

  const user = constructUser({
    subgraph,
    userEntity,
  });

  return {
    ...user,
    isInstanceAdmin,
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
  entityRecordId: EntityRecordId;
  accountGroupId: AccountGroupId;
  description?: string;
  location?: string;
  name: string;
  shortname: string;
  website?: string;
};

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

export type Org = MinimalOrg & {
  hasAvatar?: {
    linkEntity: LinkEntity;
    rightEntity: Image;
  };
  memberships: {
    membershipEntity: Entity<OrgMembershipProperties>;
    user: User;
  }[];
};

export const constructOrg = (params: {
  subgraph: Subgraph;
  orgEntity: Entity<OrgProperties>;
  resolvedUsers?: Record<EntityRecordIdString, User>;
  resolvedOrgs?: Record<EntityRecordIdString, Org>;
}): Org => {
  const { subgraph, orgEntity } = params;

  const resolvedUsers = params.resolvedUsers ?? {};
  const resolvedOrgs = params.resolvedOrgs ?? {};

  const orgMemberships = getIncomingLinksForEntity(
    subgraph,
    orgEntity.metadata.recordId.entityId,
    intervalForTimestamp(new Date().toISOString() as Timestamp),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  ) as Entity<OrgMembershipProperties>[];

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

  const org = constructMinimalOrg({
    orgEntity,
  }) as Org;

  org.hasAvatar = hasAvatar
    ? {
        // these are each arrays because each entity can have multiple revisions
        linkEntity: hasAvatar.linkEntity[0] as LinkEntity,
        rightEntity: hasAvatar.rightEntity[0] as unknown as Image,
      }
    : undefined;

  // We add it to resolved orgs *before* fully creating so that when we're traversing we know
  // we already encountered it and avoid infinite recursion
  resolvedOrgs[entityRecordIdToString(org.entityRecordId)] = org;

  org.memberships = orgMemberships.map(({ properties, linkData, metadata }) => {
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

    let user =
      resolvedUsers[entityRecordIdToString(userEntity.metadata.recordId)];

    if (!user) {
      user = constructUser({
        subgraph,
        userEntity,
        resolvedOrgs,
        resolvedUsers,
      });

      resolvedUsers[entityRecordIdToString(user.entityRecordId)] = user;
    }

    return {
      // create a new user object, because the original will be mutated in the createUser function to add 'memberOf'
      // if we don't create a new object here we will end up with a circular reference
      user: JSON.parse(JSON.stringify(user, undefined, 2)),
      membershipEntity: {
        properties,
        metadata,
        linkData,
      },
    };
  });

  return org;
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
