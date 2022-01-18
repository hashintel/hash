import { ApolloError } from "apollo-server-errors";
import {
  MutationCreateLinkedAggregationArgs,
  Resolver,
} from "../../apiTypes.gen";
import { Entity, UnresolvedGQLLinkedAggregation } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { DBAdapter } from "../../../db";
import __User from "../../../model/user.model";

export const createLinkedAggregationRaw: (
  args: MutationCreateLinkedAggregationArgs,
  config: { db: DBAdapter; user: __User },
) => Promise<UnresolvedGQLLinkedAggregation> = async (args, config) => {
  const { operation, path, sourceAccountId, sourceEntityId } = args;
  const { db, user } = config;

  return db.transaction(async (client) => {
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
      createdBy: user,
    });

    return aggregation.toGQLLinkedAggregation(db);
  });
};

export const createLinkedAggregation: Resolver<
  Promise<UnresolvedGQLLinkedAggregation>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkedAggregationArgs
> = async (_, args, { dataSources, user }) =>
  createLinkedAggregationRaw(args, { db: dataSources.db, user });
