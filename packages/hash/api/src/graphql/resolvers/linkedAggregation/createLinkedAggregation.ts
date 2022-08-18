import { ApolloError } from "apollo-server-errors";
import {
  MutationCreateLinkedAggregationArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { Entity, UnresolvedGQLLinkedAggregation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createLinkedAggregation: ResolverFn<
  Promise<UnresolvedGQLLinkedAggregation>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkedAggregationArgs
> = async (
  _,
  { sourceAccountId, sourceEntityId, path, operation },
  { dataSources, user },
) =>
  dataSources.db.transaction(async (client) => {
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    /** @todo: lock the entity on retrieval */

    if (!source) {
      const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const aggregation = await source.createAggregation(client, {
      stringifiedPath: path,
      operation: {
        ...operation,
        itemsPerPage: operation.itemsPerPage ?? 10,
        pageNumber: operation.pageNumber ?? 1,
      },
      createdBy: user as any /** @todo: replace with updated model class */,
    });

    return aggregation.toGQLLinkedAggregation(dataSources.db);
  });
