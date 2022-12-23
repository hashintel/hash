/** @todo - Fix/reimplement linkedAggregations - https://app.asana.com/0/1201095311341924/1202938872166821 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ApolloError } from "apollo-server-errors";

import { Aggregation, UnresolvedGQLLinkedAggregation } from "../../../model";
import {
  MutationUpdateLinkedAggregationOperationArgs,
  ResolverFn,
} from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const updateLinkedAggregationOperation: ResolverFn<
  Promise<UnresolvedGQLLinkedAggregation>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateLinkedAggregationOperationArgs
> = async (
  _,
  { sourceAccountId, aggregationId, updatedOperation },
  { dataSources, userModel },
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
      updatedByAccountId: userModel.getEntityUuid(),
    });

    return aggregation.toGQLLinkedAggregation(dataSources.db);
  });
