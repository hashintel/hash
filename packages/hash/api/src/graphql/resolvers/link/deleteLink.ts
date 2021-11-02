import { ApolloError } from "apollo-server-errors";
import jp from "jsonpath";
import { MutationDeleteLinkArgs, Resolver } from "../../apiTypes.gen";
import { Entity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLink: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkArgs
> = async (_, args, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const { sourceAccountId, sourceEntityId } = args;
    const sourceEntity = await Entity.getEntityLatestVersion(client)({
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    /** @todo: lock the entity on retrieval */

    if (!sourceEntity) {
      const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const { path } = args;

    const pathMatches = jp.query(sourceEntity.properties, path);

    if (pathMatches.length === 0) {
      const msg = `link with path ${path} not found on source entity with entityId ${sourceEntity.entityId}`;
      throw new ApolloError(msg, `NOT_FOUND`);
    } else if (pathMatches.length > 1) {
      const msg = `multiple links with path ${path} found on source entity with entityId ${sourceEntity.entityId}`;
      throw new ApolloError(msg, `NOT_FOUND`);
    }

    jp.value(sourceEntity.properties, path, undefined);

    await sourceEntity.updateEntityProperties(client)(sourceEntity.properties);

    return true;
  });
