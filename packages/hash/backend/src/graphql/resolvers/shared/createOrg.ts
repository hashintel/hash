import { genId } from "../../../util";
import { MutationCreateOrgArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Org } from "../../apiTypes.gen";
import { dbEntityToGraphQLOrg } from "../../util";

export const createOrg: Resolver<
  Promise<Org>,
  {},
  GraphQLContext,
  MutationCreateOrgArgs
> = async (_, { shortname }, { dataSources }) => {
  const id = genId();

  const entity = await dataSources.db.createEntity({
    accountId: id,
    entityVersionId: id,
    createdById: genId(), // TODO
    systemTypeName: "Org",
    properties: { shortname },
    versioned: false, // @todo: should orgs be versioned?
  });

  return dbEntityToGraphQLOrg(entity);
};
