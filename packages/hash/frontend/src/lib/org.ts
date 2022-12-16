import { extractBaseUri } from "@blockprotocol/type-system";
import { types } from "@hashintel/hash-shared/ontology-types";
import {
  Subgraph,
  EntityEditionId,
  entityEditionIdToString,
  EntityEditionIdString,
} from "@hashintel/hash-subgraph";
import {
  AccountEntityId,
  AccountId,
  extractAccountId,
} from "@hashintel/hash-shared/types";

import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
  getIncomingLinksForEntityAtMoment,
  getLeftEntityForLinkEntityAtMoment,
} from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { constructUser, User } from "./user";

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
