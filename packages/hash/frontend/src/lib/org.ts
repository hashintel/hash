import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import {
  Subgraph,
  EntityEditionId,
  extractEntityUuidFromEntityId,
} from "@hashintel/hash-subgraph";
import { getEntityByEditionId } from "@hashintel/hash-subgraph/src/stdlib/element/entity";
import {
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

  return {
    ...constructMinimalOrg({
      subgraph,
      orgEntityEditionId,
    }),
    /**
     * @todo implement members once we are able to fetch incoming links
     *   see https://app.asana.com/0/1201095311341924/1203250435416416/f
     */
    members: [],
  };
};

export type OrgWithResponsibility = Org & { responsibility: string };
