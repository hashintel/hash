import { ApolloError } from "apollo-server-express";

import { QueryPageArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { entity } from "../entity/";
import { Entity } from "../../../db/adapter";

export const page: Resolver<
  Promise<Entity>,
  {},
  GraphQLContext,
  QueryPageArgs
> = async (_, args, ctx, info) => {
  const ent = await entity({}, args, ctx, info);
  if (ent.entityTypeName !== "Page") {
    throw new ApolloError(
      `Entity ${ent.id} is type "${ent.entityTypeName}" not "Page"`
    );
  }

  // TODO: get visibility from entity metadata
  return ent;
};
