import { ApolloError } from "apollo-server-errors";
import {
  MutationDeleteLinkedAggregationArgs,
  Resolver,
} from "../../apiTypes.gen";
import { Entity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLinkedAggregation: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkedAggregationArgs
> = async (
  _,
  { sourceAccountId, sourceEntityId, path },
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

    if (!aggregation) {
      const msg = `aggregation with path '${path}' not found on entity with fixed ID ${source.entityId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    await aggregation.delete(client, { deletedByAccountId: user.accountId });

    return true;
  });
