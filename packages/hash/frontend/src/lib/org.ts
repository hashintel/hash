import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import {
  EntityVertex,
  getIncomingLinksOfEntity,
  mustGetEntity,
  Subgraph,
} from "./subgraph";
import { constructMinimalUser, MinimalUser } from "./user";

export type MinimalOrg = {
  entityId: string;
  shortname: string;
  name: string;
  numberOfMembers: number;
};

export const constructMinimalOrg = (params: {
  subgraph: Subgraph;
  orgEntityId: string;
}): MinimalOrg => {
  const { subgraph, orgEntityId } = params;

  const { properties } = mustGetEntity({ subgraph, entityId: orgEntityId });

  const shortname: string =
    properties[extractBaseUri(types.propertyType.shortName.propertyTypeId)];

  const name: string =
    properties[extractBaseUri(types.propertyType.orgName.propertyTypeId)];

  return {
    entityId: orgEntityId,
    shortname,
    name,
    numberOfMembers: 0,
  };
};

export type Org = MinimalOrg & {
  members: (MinimalUser & { responsibility: string })[];
};

export const constructOrg = (params: {
  subgraph: Subgraph;
  orgEntityId: string;
}): Org => {
  const { subgraph, orgEntityId } = params;

  const { entityId, shortname, name, numberOfMembers } = constructMinimalOrg({
    orgEntityId,
    subgraph,
  });

  const incomingOfOrgLinks = getIncomingLinksOfEntity({
    entityId: orgEntityId,
    subgraph,
    linkTypeId: types.linkType.ofOrg.linkTypeId,
  });

  const orgMemberships = incomingOfOrgLinks.map(
    ({ inner }) =>
      subgraph.vertices[inner.sourceEntityId] as unknown as EntityVertex,
  );

  return {
    entityId,
    shortname,
    name,
    numberOfMembers,
    members: orgMemberships.map(({ inner: orgMembershipEntity }) => {
      const responsibility: string =
        orgMembershipEntity.properties[
          extractBaseUri(types.propertyType.responsibility.propertyTypeId)
        ];

      const incomingHasMembershipLinks = getIncomingLinksOfEntity({
        entityId: orgMembershipEntity.entityId,
        subgraph,
        linkTypeId: types.linkType.hasMembership.linkTypeId,
      });

      const userEntityId = incomingHasMembershipLinks[0]!.inner.sourceEntityId;

      return {
        ...constructMinimalUser({ subgraph, userEntityId }),
        responsibility,
      };
    }),
  };
};

export type OrgWithResponsibility = Org & { responsibility: string };
