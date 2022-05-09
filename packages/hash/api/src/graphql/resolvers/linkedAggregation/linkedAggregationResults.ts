import { ApolloError } from "apollo-server-express";
import { GraphQLContext } from "../../context";
import {
  Aggregation,
  Entity,
  UnresolvedGQLLinkedAggregation,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { Resolver } from "../../apiTypes.gen";

export const linkedAggregationResults: Resolver<
  UnresolvedGQLUnknownEntity[],
  UnresolvedGQLLinkedAggregation,
  GraphQLContext
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
