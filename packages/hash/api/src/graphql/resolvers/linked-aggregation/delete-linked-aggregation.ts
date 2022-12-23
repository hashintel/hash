/** @todo - Fix/reimplement linkedAggregations - https://app.asana.com/0/1201095311341924/1202938872166821 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { ApolloError } from "apollo-server-errors";

import { Aggregation } from "../../../model";
import {
  MutationDeleteLinkedAggregationArgs,
  ResolverFn,
} from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLinkedAggregation: ResolverFn<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkedAggregationArgs
> = async (_, { sourceAccountId, aggregationId }, { dataSources, userModel }) =>
  dataSources.db.transaction(async (client) => {
    const aggregation = await Aggregation.getAggregationById(client, {
      sourceAccountId,
      aggregationId,
    });

    if (!aggregation) {
      const msg = `aggregation with aggregation ID '${aggregationId}' not found`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    await aggregation.delete(client, {
      deletedByAccountId: userModel.getEntityUuid(),
    });

    return true;
  });
