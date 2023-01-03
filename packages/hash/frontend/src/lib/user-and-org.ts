import { extractBaseUri } from "@blockprotocol/type-system";
import { types } from "@hashintel/hash-shared/ontology-types";
import {
  AccountEntityId,
  AccountId,
  extractAccountId,
} from "@hashintel/hash-shared/types";
import {
  EntityEditionId,
  EntityEditionIdString,
  entityEditionIdToString,
  Subgraph,
} from "@hashintel/hash-subgraph";
import {
  getIncomingLinksForEntityAtMoment,
  getLeftEntityForLinkEntityAtMoment,
  getOutgoingLinksForEntityAtMoment,
  getRightEntityForLinkEntityAtMoment,
} from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import { Session } from "@ory/client";

export type MinimalUser = {
  kind: "user";
  entityEditionId: EntityEditionId;
  accountId: AccountId;
  accountSignupComplete: boolean;
  shortname?: string;
  preferredName?: string;
};

export const constructMinimalUser = (params: {
  subgraph: Subgraph;
  userEntityEditionId: EntityEditionId;
}): MinimalUser => {
  const { subgraph, userEntityEditionId } = params;

  const { metadata, properties } =
    getEntityByEditionId(subgraph, userEntityEditionId) ?? {};
  if (!properties || !metadata) {
    throw new Error(
      `Could not find entity edition with ID ${userEntityEditionId} in subgraph`,
    );
  }

  const shortname: string = properties[
    extractBaseUri(types.propertyType.shortName.propertyTypeId)
  ] as string;

  const preferredName: string = properties[
    extractBaseUri(types.propertyType.preferredName.propertyTypeId)
  ] as string;

  const accountSignupComplete = !!shortname && !!preferredName;

  return {
    kind: "user",
    entityEditionId: userEntityEditionId,
    // Cast reason: The EntityUuid of a User's baseId is an AccountId
    accountId: extractAccountId(userEntityEditionId.baseId as AccountEntityId),
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
  userEntityEditionId: EntityEditionId;
  resolvedUsers?: Record<EntityEditionIdString, User>;
  resolvedOrgs?: Record<EntityEditionIdString, Org>;
}): User => {
  const { userEntityEditionId, subgraph } = params;

  const resolvedUsers = params.resolvedUsers ?? {};
  const resolvedOrgs = params.resolvedOrgs ?? {};

  const orgMemberships = getOutgoingLinksForEntityAtMoment(
    subgraph,
    userEntityEditionId.baseId,
    new Date(),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  );

  const user = constructMinimalUser({ userEntityEditionId, subgraph }) as User;

  // We add it to resolved users *before* fully creating so that when we're traversing we know
  // we already encountered it and avoid infinite recursion
  resolvedUsers[entityEditionIdToString(user.entityEditionId)] = user;

  user.memberOf = orgMemberships.map(({ properties, linkData, metadata }) => {
    const responsibility: string = properties[
      extractBaseUri(types.propertyType.responsibility.propertyTypeId)
    ] as string;

    if (!linkData?.rightEntityId) {
      throw new Error("Expected org membership to contain a right entity");
    }
    const orgEntity = getRightEntityForLinkEntityAtMoment(
      subgraph,
      metadata.editionId.baseId,
      new Date(),
    );

    let org =
      resolvedOrgs[entityEditionIdToString(orgEntity.metadata.editionId)];

    if (!org) {
      // eslint-disable-next-line @typescript-eslint/no-use-before-define
      org = constructOrg({
        subgraph,
        orgEntityEditionId: orgEntity.metadata.editionId,
        resolvedUsers,
        resolvedOrgs,
      });

      resolvedOrgs[entityEditionIdToString(org.entityEditionId)] = org;
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
  userEntityEditionId: EntityEditionId;
  subgraph: Subgraph;
  kratosSession: Session;
}): AuthenticatedUser => {
  const { userEntityEditionId, subgraph } = params;

  const { metadata, properties } =
    getEntityByEditionId(subgraph, userEntityEditionId) ?? {};

  if (!properties || !metadata) {
    throw new Error(
      `Could not find entity with ID ${userEntityEditionId.baseId} in subgraph`,
    );
  }

  const primaryEmailAddress: string = properties[
    extractBaseUri(types.propertyType.email.propertyTypeId)
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
    userEntityEditionId: metadata.editionId,
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
  entityEditionId: EntityEditionId;
  accountId: AccountId;
  shortname: string;
  name: string;
};

export const constructMinimalOrg = (params: {
  subgraph: Subgraph;
  orgEntityEditionId: EntityEditionId;
}): MinimalOrg => {
  const { subgraph, orgEntityEditionId } = params;

  const { metadata, properties } =
    getEntityByEditionId(subgraph, orgEntityEditionId) ?? {};
  if (!properties || !metadata) {
    throw new Error(
      `Could not find entity edition with ID ${orgEntityEditionId} in subgraph`,
    );
  }

  const shortname: string = properties[
    extractBaseUri(types.propertyType.shortName.propertyTypeId)
  ] as string;

  const name: string = properties[
    extractBaseUri(types.propertyType.orgName.propertyTypeId)
  ] as string;

  return {
    kind: "org",
    entityEditionId: orgEntityEditionId,
    accountId: extractAccountId(orgEntityEditionId.baseId as AccountEntityId),
    shortname,
    name,
  };
};

export type Org = MinimalOrg & {
  members: (User & { responsibility: string })[];
};

export const constructOrg = (params: {
  subgraph: Subgraph;
  orgEntityEditionId: EntityEditionId;
  resolvedUsers?: Record<EntityEditionIdString, User>;
  resolvedOrgs?: Record<EntityEditionIdString, Org>;
}): Org => {
  const { subgraph, orgEntityEditionId } = params;

  const resolvedUsers = params.resolvedUsers ?? {};
  const resolvedOrgs = params.resolvedOrgs ?? {};

  const orgMemberships = getIncomingLinksForEntityAtMoment(
    subgraph,
    orgEntityEditionId.baseId,
    new Date(),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  );

  const org = constructMinimalOrg({
    subgraph,
    orgEntityEditionId,
  }) as Org;

  // We add it to resolved orgs *before* fully creating so that when we're traversing we know
  // we already encountered it and avoid infinite recursion
  resolvedOrgs[entityEditionIdToString(org.entityEditionId)] = org;

  org.members = orgMemberships.map(({ properties, linkData, metadata }) => {
    const responsibility: string = properties[
      extractBaseUri(types.propertyType.responsibility.propertyTypeId)
    ] as string;

    if (!linkData?.leftEntityId) {
      throw new Error("Expected org membership to contain a left entity");
    }
    const userEntity = getLeftEntityForLinkEntityAtMoment(
      subgraph,
      metadata.editionId.baseId,
      new Date(),
    );

    let user =
      resolvedUsers[entityEditionIdToString(userEntity.metadata.editionId)];

    if (!user) {
      user = constructUser({
        subgraph,
        userEntityEditionId: userEntity.metadata.editionId,
        resolvedOrgs,
        resolvedUsers,
      });

      resolvedUsers[entityEditionIdToString(user.entityEditionId)] = user;
    }

    return {
      ...user,
      responsibility,
    };
  });

  return org;
};
