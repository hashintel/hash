import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity } from "../../../db/adapter";

export const accounts: Resolver<
  Promise<Entity[]>,
  {},
  GraphQLContext,
  {}
> = async (_, {}, { dataSources }) => {
  return dataSources.db.getAccountEntities();
};
