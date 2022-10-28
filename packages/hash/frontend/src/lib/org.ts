import { extractBaseUri } from "@blockprotocol/type-system-web";
import { types } from "@hashintel/hash-shared/types";
import { mustGetEntity, Subgraph } from "./subgraph";
import { MinimalUser } from "./user";

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

export type Org = MinimalOrg & { members: MinimalUser[] };

export const constructOrg = (params: {
  subgraph: Subgraph;
  orgEntityId: string;
}): Org => {
  const { subgraph, orgEntityId } = params;

  const { entityId, shortname, name, numberOfMembers } = constructMinimalOrg({
    orgEntityId,
    subgraph,
  });

  return {
    entityId,
    shortname,
    name,
    numberOfMembers,
    /** @todo: get members of org */
    members: [],
  };
};

export type OrgWithResponsibility = Org & { responsibility: string };
