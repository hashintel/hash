import { ApolloError } from "apollo-server-express";
import { GraphQLContext } from "../../context";
import {
  Entity,
  UnresolvedGQLLinkedAggregation,
  UnresolvedGQLUnknownEntity,
} from "../../../model";
import { Resolver } from "../../apiTypes.gen";

export const linkedAggregationResults: Resolver<
  UnresolvedGQLUnknownEntity[],
  UnresolvedGQLLinkedAggregation,
  GraphQLContext
> = async ({ sourceAccountId, sourceEntityId, path }, _, { dataSources }) => {
  const source = await Entity.getEntityLatestVersion(dataSources.db, {
    accountId: sourceAccountId,
    entityId: sourceEntityId,
  });

  if (!source) {
    const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const aggregation = await source.getAggregationByPath(dataSources.db, {
    stringifiedPath: path,
  });

  if (!aggregation) {
    const msg = `aggregation with path ${path} not on entity with fixed ID ${sourceEntityId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const results = await aggregation.getResults(dataSources.db);

  return results.map((result) => result.toGQLUnknownEntity());
};
