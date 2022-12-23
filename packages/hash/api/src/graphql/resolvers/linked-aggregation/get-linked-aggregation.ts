/** @todo - Fix/reimplement linkedAggregations - https://app.asana.com/0/1201095311341924/1202938872166821 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ApolloError } from "apollo-server-express";

import { Aggregation, UnresolvedGQLLinkedAggregation } from "../../../model";
import { QueryGetLinkedAggregationArgs, ResolverFn } from "../../api-types.gen";
import { GraphQLContext } from "../../context";

export const getLinkedAggregation: ResolverFn<
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
