import { ApolloError } from "apollo-server-express";

import { QueryPageArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { entity } from "../entity";
import { UnresolvedGQLEntity } from "../../../model";

export const page: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  GraphQLContext,
  QueryPageArgs
> = async (_, { accountId, entityId, entityVersionId }, ctx, info) => {
  const ent = await entity(
    {},
    { accountId, entityId, entityVersionId },
    ctx,
    info,
  );
  if (ent.entityTypeName !== "Page") {
    throw new ApolloError(
      `Entity ${ent.entityId} is type "${ent.entityTypeName}" not "Page"`,
    );
  }

  // TODO: get visibility from entity metadata
  return ent;
};
