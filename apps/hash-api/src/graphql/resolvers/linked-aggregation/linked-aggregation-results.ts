/** @todo - Fix/reimplement linkedAggregations - https://app.asana.com/0/1201095311341924/1202938872166821 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ApolloError } from "apollo-server-express";

import {
  Aggregation,
  Entity,
  UnresolvedGQLLinkedAggregation,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { ResolverFn } from "../../api-types.gen";
import { GraphQLContext } from "../../context";

export const linkedAggregationResults: ResolverFn<
  UnresolvedGQLUnknownEntity[],
  UnresolvedGQLLinkedAggregation,
  GraphQLContext,
  {}
> = async (
  { sourceAccountId, sourceEntityId, aggregationId },
  _,
  { dataSources },
) => {
  const source = await Entity.getEntityLatestVersion(dataSources.db, {
    accountId: sourceAccountId,
    entityId: sourceEntityId,
  });

  if (!source) {
    const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const aggregation = await Aggregation.getAggregationById(dataSources.db, {
    sourceAccountId,
    aggregationId,
  });

  if (!aggregation) {
    const msg = `aggregation with aggregation ID ${aggregationId} not on entity with fixed ID ${sourceEntityId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const results = await aggregation.getResults(dataSources.db);

  return results.map((result) => result.toGQLUnknownEntity());
};
