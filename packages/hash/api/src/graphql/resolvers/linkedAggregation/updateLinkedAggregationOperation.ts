import { ApolloError } from "apollo-server-errors";
import {
  MutationUpdateLinkedAggregationOperationArgs,
  Resolver,
} from "../../apiTypes.gen";
import { Aggregation, UnresolvedGQLLinkedAggregation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const updateLinkedAggregationOperation: Resolver<
  Promise<UnresolvedGQLLinkedAggregation>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateLinkedAggregationOperationArgs
> = async (
  _,
  { sourceAccountId, aggregationId, updatedOperation },
  { dataSources, user },
) =>
  dataSources.db.transaction(async (client) => {
    const aggregation = await Aggregation.getAggregationById(client, {
      sourceAccountId,
      aggregationId,
    });

    /** @todo: lock aggregation on retrieval? */

    if (!aggregation) {
      const msg = `aggregation with aggregation ID '${aggregationId}' not found`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    await aggregation.updateOperation(client, {
      operation: {
        ...updatedOperation,
        itemsPerPage: updatedOperation.itemsPerPage ?? 10,
        pageNumber: updatedOperation.pageNumber ?? 1,
      },
      updatedByAccountId: user.accountId,
    });

    return aggregation.toGQLLinkedAggregation(dataSources.db);
  });
