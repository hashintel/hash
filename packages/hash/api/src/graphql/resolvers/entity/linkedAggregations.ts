import { ApolloError } from "apollo-server-express";
import { Entity, UnresolvedGQLLinkedAggregation } from "../../../model";
import { Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { DbUnknownEntity } from "../../../types/dbTypes";

export const linkedAggregations: Resolver<
  Promise<UnresolvedGQLLinkedAggregation[]>,
  DbUnknownEntity,
  GraphQLContext
> = async ({ accountId, entityId }, _, { dataSources }) => {
  const source = await Entity.getEntityLatestVersion(dataSources.db, {
    accountId,
    entityId,
  });

  if (!source) {
    const msg = `entity with fixed ID ${entityId} not found in account ${accountId}`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  const aggregations = await source.getAggregations(dataSources.db);

  return await Promise.all(
    aggregations.map((aggregation) =>
      aggregation.toGQLLinkedAggregation(dataSources.db),
    ),
  );
};
