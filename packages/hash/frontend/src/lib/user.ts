import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import { Session } from "@ory/client";
import {
  EntityVertex,
  mustGetEntity,
  getOutgoingLinksOfEntity,
  Subgraph,
} from "./subgraph";
import { constructOrg, Org } from "./org";

export type MinimalUser = {
  kind: "user";
  entityId: string;
  accountSignupComplete: boolean;
  isInstanceAdmin: boolean;
  shortname?: string;
  preferredName?: string;
};

export const constructMinimalUser = (params: {
  subgraph: Subgraph;
  userEntityId: string;
}): MinimalUser => {
  const { subgraph, userEntityId } = params;

  const { properties } = mustGetEntity({ subgraph, entityId: userEntityId });

  const shortname: string =
    properties[extractBaseUri(types.propertyType.shortName.propertyTypeId)];

  const preferredName: string =
    properties[extractBaseUri(types.propertyType.preferredName.propertyTypeId)];

  const isInstanceAdmin: boolean =
    properties[
      extractBaseUri(types.propertyType.isInstanceAdmin.propertyTypeId)
    ];

  const accountSignupComplete = !!shortname && !!preferredName;

  return {
    kind: "user",
    entityId: userEntityId,
    shortname,
    preferredName,
    accountSignupComplete,
    isInstanceAdmin,
  };
};

export type User = MinimalUser & {
  memberOf: (Org & { responsibility: string })[];
};

export const constructUser = (params: {
  userEntityId: string;
  subgraph: Subgraph;
}): User => {
  const { userEntityId, subgraph } = params;

  const outgoingHasMembershipLinks = getOutgoingLinksOfEntity({
    entityId: userEntityId,
    subgraph,
    linkTypeId: types.linkType.hasMembership.linkTypeId,
  });

  const orgMemberships = outgoingHasMembershipLinks.map(
    ({ inner }) =>
      subgraph.vertices[inner.targetEntityId] as unknown as EntityVertex,
  );

  return {
    ...constructMinimalUser({ userEntityId, subgraph }),
    memberOf: orgMemberships.map(({ inner: orgMembershipEntity }) => {
      const responsibility: string =
        orgMembershipEntity.properties[
          extractBaseUri(types.propertyType.responsibility.propertyTypeId)
        ];

      const outgoingOfOrgLinks = getOutgoingLinksOfEntity({
        entityId: orgMembershipEntity.entityId,
        subgraph,
        linkTypeId: types.linkType.ofOrg.linkTypeId,
      });

      const orgEntityId = outgoingOfOrgLinks[0]!.inner.targetEntityId;

      return {
        ...constructOrg({ subgraph, orgEntityId }),
        responsibility,
      };
    }),
  };
};

export type AuthenticatedUser = User & {
  emails: { address: string; primary: boolean; verified: boolean }[];
};

export const constructAuthenticatedUser = (params: {
  userEntityId: string;
  subgraph: Subgraph;
  kratosSession: Session;
}): AuthenticatedUser => {
  const { userEntityId, subgraph } = params;

  const { properties } = mustGetEntity({ subgraph, entityId: userEntityId });

  const primaryEmailAddress: string =
    properties[extractBaseUri(types.propertyType.email.propertyTypeId)];

  const isPrimaryEmailAddressVerified =
    params.kratosSession.identity.verifiable_addresses?.find(
      ({ value }) => value === primaryEmailAddress,
    )?.verified === true;

  const user = constructUser({ userEntityId, subgraph });
  return {
    ...user,
    emails: [
      {
        address: primaryEmailAddress,
        verified: isPrimaryEmailAddressVerified,
        primary: true,
      },
    ],
  };
};
