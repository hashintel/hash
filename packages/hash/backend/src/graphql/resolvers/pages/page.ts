import { ApolloError } from "apollo-server-express";

import { QueryPageArgs, Resolver, UnknownEntity } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { entity } from "../entity/";

export const page: Resolver<
  Promise<UnknownEntity>,
  {},
  GraphQLContext,
  QueryPageArgs
> = async (_, args, ctx, info) => {
  const ent = await entity({}, args, ctx, info);
  if (ent.entityTypeName !== "Page") {
    throw new ApolloError(
      `Entity ${ent.entityId} is type "${ent.entityTypeName}" not "Page"`
    );
  }

  // TODO: get visibility from entity metadata
  return ent;
};
