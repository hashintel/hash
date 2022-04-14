import { ApolloError } from "apollo-server-errors";
import {
  MutationUpdateLinkedAggregationOperationArgs,
  Resolver,
} from "../../apiTypes.gen";
import { Entity, UnresolvedGQLLinkedAggregation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const updateLinkedAggregationOperation: Resolver<
  Promise<UnresolvedGQLLinkedAggregation>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateLinkedAggregationOperationArgs
> = async (
  _,
  { sourceAccountId, sourceEntityId, path, updatedOperation },
  { dataSources, user },
) =>
  dataSources.db.transaction(async (client) => {
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    if (!source) {
      const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const aggregation = await source.getAggregationByPath(client, {
      stringifiedPath: path,
    });

    /** @todo: lock aggregation on retrieval? */

    if (!aggregation) {
      const msg = `aggregation with path '${path}' not found on entity with fixed ID ${source.entityId}`;
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
