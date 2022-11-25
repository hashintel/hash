import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import {
  Subgraph,
  EntityEditionId,
  extractEntityUuidFromEntityId,
} from "@hashintel/hash-subgraph";
import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
  getIncomingLinksForEntityAtMoment,
  getLeftEntityForLinkEntityAtMoment,
} from "@hashintel/hash-subgraph/src/stdlib/edge/link";
import {
  constructMinimalUser,
  constructUser,
  // constructMinimalUser,
  MinimalUser,
} from "./user";

export type MinimalOrg = {
  kind: "org";
  entityEditionId: EntityEditionId;
  orgAccountId: string;
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
    orgAccountId: extractEntityUuidFromEntityId(orgEntityEditionId.baseId),
    shortname,
    name,
  };
};

export type Org = MinimalOrg & {
  members: (MinimalUser & { responsibility: string })[];
};

export const constructOrg = (params: {
  subgraph: Subgraph;
  orgEntityEditionId: EntityEditionId;
}): Org => {
  const { subgraph, orgEntityEditionId } = params;

  const orgMemberships = getIncomingLinksForEntityAtMoment(
    subgraph,
    orgEntityEditionId.baseId,
    new Date(),
  ).filter(
    (linkEntity) =>
      linkEntity.metadata.entityTypeId ===
      types.linkEntityType.orgMembership.linkEntityTypeId,
  );

  return {
    ...constructMinimalOrg({
      subgraph,
      orgEntityEditionId,
    }),
    members: orgMemberships.map(({ metadata, properties }) => {
      const responsibility: string = properties[
        extractBaseUri(types.propertyType.responsibility.propertyTypeId)
      ] as string;

      if (!metadata.linkMetadata?.leftEntityId) {
        throw new Error("Expected org membership to contain a left entity");
      }
      const user = getLeftEntityForLinkEntityAtMoment(
        subgraph,
        metadata.editionId.baseId,
        new Date(),
      );

      return {
        ...constructMinimalUser({
          subgraph,
          userEntityEditionId: user.metadata.editionId,
        }),
        responsibility,
      };
    }),
  };
};
