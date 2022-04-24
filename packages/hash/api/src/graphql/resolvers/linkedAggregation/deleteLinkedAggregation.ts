import { ApolloError } from "apollo-server-errors";
import {
  MutationDeleteLinkedAggregationArgs,
  Resolver,
} from "../../apiTypes.gen";
import { Aggregation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLinkedAggregation: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkedAggregationArgs
> = async (_, { sourceAccountId, aggregationId }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const aggregation = await Aggregation.getAggregationById(client, {
      sourceAccountId,
      aggregationId,
    });

    if (!aggregation) {
      const msg = `aggregation with aggregation ID '${aggregationId}' not found`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    await aggregation.delete(client, { deletedByAccountId: user.accountId });

    return true;
  });
