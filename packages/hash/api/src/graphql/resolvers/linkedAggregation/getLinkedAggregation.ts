import { ApolloError } from "apollo-server-express";

import { QueryGetLinkedAggregationArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLLinkedAggregation, Aggregation } from "../../../model";

export const getLinkedAggregation: Resolver<
  Promise<UnresolvedGQLLinkedAggregation>,
  {},
  GraphQLContext,
  QueryGetLinkedAggregationArgs
> = async (_, { sourceAccountId, aggregationId }, { dataSources }) => {
  return dataSources.db.transaction(async (client) => {
    const linkedAggregation = await Aggregation.getAggregationById(client, {
      sourceAccountId,
      aggregationId,
    });

    if (!linkedAggregation) {
      throw new ApolloError(
        `LinkedAggregation with aggregationId '${aggregationId}' and sourceAccountId '${sourceAccountId}' not found`,
        "NOT_FOUND",
      );
    }

    return linkedAggregation.toGQLLinkedAggregation(client);
  });
};
