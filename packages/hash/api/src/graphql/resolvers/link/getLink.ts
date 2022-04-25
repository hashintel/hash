import { ApolloError } from "apollo-server-express";

import { QueryGetLinkArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLLink, Link } from "../../../model";

export const getLink: Resolver<
  Promise<UnresolvedGQLLink>,
  {},
  GraphQLContext,
  QueryGetLinkArgs
> = async (_, { sourceAccountId, linkId }, { dataSources }) => {
  return dataSources.db.transaction(async (client) => {
    const link = await Link.get(client, {
      sourceAccountId,
      linkId,
    });

    if (!link) {
      throw new ApolloError(
        `Link with linkId '${linkId}' and sourceAccountId '${sourceAccountId}' not found`,
        "NOT_FOUND",
      );
    }

    return link.toUnresolvedGQLLink();
  });
};
