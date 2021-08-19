import { genId } from "../../../util";
import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity } from "../../../db/adapter";

export const createOrg: Resolver<
  Promise<Entity>,
  {},
  GraphQLContext,
  MutationCreateOrgArgs
> = async (_, { shortname }, { dataSources }) => {
  const id = genId();

  return dataSources.db.createEntity({
    accountId: id,
    entityVersionId: id,
    createdById: genId(), // TODO
    systemTypeName: "Org",
    properties: { shortname },
    versioned: false, // @todo: should orgs be versioned?
  });
};
