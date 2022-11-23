import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import { Subgraph, EntityEditionId } from "@hashintel/hash-subgraph";
import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
  getOutgoingLinksForEntityAtMoment,
  getRightEntityForLinkEntityAtMoment,
} from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import { Session } from "@ory/client";
import { constructOrg, Org } from "./org";

export type MinimalUser = {
  kind: "user";
  entityEditionId: EntityEditionId;
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
}): User => {
  const { userEntityEditionId, subgraph } = params;

  const orgMemberships = getOutgoingLinksForEntityAtMoment(
    subgraph,
    userEntityEditionId.baseId,
    new Date(),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  );

  return {
    ...constructMinimalUser({ userEntityEditionId, subgraph }),
    memberOf: orgMemberships.map(({ metadata, properties }) => {
      const responsibility: string = properties[
        extractBaseUri(types.propertyType.responsibility.propertyTypeId)
      ] as string;

      if (!metadata.linkMetadata?.rightEntityId) {
        throw new Error("Expected org membership to contain a right entity");
      }
      const org = getRightEntityForLinkEntityAtMoment(
        subgraph,
        metadata.editionId.baseId,
        metadata.editionId.version,
      );

      return {
        ...constructOrg({
          subgraph,
          orgEntityEditionId: org.metadata.editionId,
        }),
        responsibility,
      };
    }),
  };
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
      `Could not find entity with ID ${userEntityEditionId} in subgraph`,
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
