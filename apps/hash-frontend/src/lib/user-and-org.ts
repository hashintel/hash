import { types } from "@local/hash-isomorphic-utils/ontology-types";
import {
  AccountEntityId,
  AccountId,
  Entity,
  EntityRecordId,
  EntityRecordIdString,
  entityRecordIdToString,
  extractAccountId,
  Subgraph,
  Timestamp,
} from "@local/hash-subgraph";
import {
  getIncomingLinksForEntity,
  getLeftEntityForLinkEntity,
  getOutgoingLinksForEntity,
  getRightEntityForLinkEntity,
  intervalCompareWithInterval,
  intervalForTimestamp,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
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
  userEntity: Entity;
}): MinimalUser => {
  const { userEntity } = params;

  const shortname: string = userEntity.properties[
    extractBaseUrl(types.propertyType.shortName.propertyTypeId)
  ] as string;

  const preferredName: string = userEntity.properties[
    extractBaseUrl(types.propertyType.preferredName.propertyTypeId)
  ] as string;

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
  memberOf: (Org & { responsibility: string })[];
};

export const constructUser = (params: {
  subgraph: Subgraph;
  userEntity: Entity;
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

  user.memberOf = orgMemberships.map(({ properties, linkData, metadata }) => {
    const responsibility: string = properties[
      extractBaseUrl(types.propertyType.responsibility.propertyTypeId)
    ] as string;

    if (!linkData?.rightEntityId) {
      throw new Error("Expected org membership to contain a right entity");
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

    return {
      ...org,
      responsibility,
    };
  });

  return user;
};

export type AuthenticatedUser = User & {
  isInstanceAdmin: boolean;
  emails: { address: string; primary: boolean; verified: boolean }[];
};

export const constructAuthenticatedUser = (params: {
  userEntity: Entity;
  subgraph: Subgraph;
  kratosSession: Session;
}): AuthenticatedUser => {
  const { userEntity, subgraph } = params;

  const primaryEmailAddress: string = userEntity.properties[
    extractBaseUrl(types.propertyType.email.propertyTypeId)
  ] as string;

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
  accountId: AccountId;
  shortname: string;
  name: string;
};

export const constructMinimalOrg = (params: {
  orgEntity: Entity;
}): MinimalOrg => {
  const { orgEntity } = params;

  const shortname: string = orgEntity.properties[
    extractBaseUrl(types.propertyType.shortName.propertyTypeId)
  ] as string;

  const name: string = orgEntity.properties[
    extractBaseUrl(types.propertyType.orgName.propertyTypeId)
  ] as string;

  return {
    kind: "org",
    entityRecordId: orgEntity.metadata.recordId,
    accountId: extractAccountId(
      orgEntity.metadata.recordId.entityId as AccountEntityId,
    ),
    shortname,
    name,
  };
};

export type Org = MinimalOrg & {
  members: (User & { responsibility: string })[];
};

export const constructOrg = (params: {
  subgraph: Subgraph;
  orgEntity: Entity;
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
  );

  const org = constructMinimalOrg({
    orgEntity,
  }) as Org;

  // We add it to resolved orgs *before* fully creating so that when we're traversing we know
  // we already encountered it and avoid infinite recursion
  resolvedOrgs[entityRecordIdToString(org.entityRecordId)] = org;

  org.members = orgMemberships.map(({ properties, linkData, metadata }) => {
    const responsibility: string = properties[
      extractBaseUrl(types.propertyType.responsibility.propertyTypeId)
    ] as string;

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
      ...user,
      responsibility,
    };
  });

  return org;
};
