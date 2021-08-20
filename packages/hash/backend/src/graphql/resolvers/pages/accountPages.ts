import { QueryAccountPagesArgs, Resolver } from "../../apiTypes.gen";
import { Entity } from "../../../db/adapter";
import { GraphQLContext } from "../../context";

export const accountPages: Resolver<
  Promise<Entity[]>,
  {},
  GraphQLContext,
  QueryAccountPagesArgs
> = async (_, { accountId }, { dataSources }) => {
  return dataSources.db.getEntitiesBySystemType({
    accountId,
    systemTypeName: "Page",
    latestOnly: true,
  });
};
