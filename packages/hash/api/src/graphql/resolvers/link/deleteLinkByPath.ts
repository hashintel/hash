import { ApolloError } from "apollo-server-errors";
import jp from "jsonpath";
import { MutationDeleteLinkByPathArgs, Resolver } from "../../apiTypes.gen";
import { Entity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLinkByPath: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkByPathArgs
> = async (_, args, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const { srcAccountId, srcEntityId } = args;
    const sourceEntity = await Entity.getEntityLatestVersion(client, {
      accountId: srcAccountId,
      entityId: srcEntityId,
    });

    /** @todo: lock the entity on retrieval */

    if (!sourceEntity) {
      const msg = `entity with fixed ID ${srcEntityId} not found in account ${srcAccountId}`;
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

    await sourceEntity.updateEntityProperties(client, sourceEntity.properties);

    return true;
  });
