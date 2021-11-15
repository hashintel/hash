import { ApolloError } from "apollo-server-errors";
import jp from "jsonpath";
import { MutationDeleteLinkByPathArgs, Resolver } from "../../apiTypes.gen";
import { Entity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { isRecord } from "../../../util";

export const removeArrayNulls = (thing: unknown) => {
  if (typeof thing === "object") {
    if (Array.isArray(thing)) {
      for (const [i, arrayItem] of thing.entries()) {
        if (arrayItem === undefined || arrayItem === null) {
          thing.splice(i, 1);
        } else {
          removeArrayNulls(arrayItem);
        }
      }
    } else if (isRecord(thing)) {
      Object.values(thing).forEach(removeArrayNulls);
    }
  }
};

export const deleteLinkByPath: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkByPathArgs
> = async (_, args, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const { sourceAccountId, sourceEntityId } = args;
    const sourceEntity = await Entity.getEntityLatestVersion(client, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    /** @todo: lock the entity on retrieval */

    if (!sourceEntity) {
      const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const { path: stringifiedPathWithoutIndex, index } = args;

    const stringifiedPath =
      typeof index === "number"
        ? `${stringifiedPathWithoutIndex}[${index}]`
        : stringifiedPathWithoutIndex;

    const pathMatches = jp
      .query(sourceEntity.properties, stringifiedPath)
      .flat()
      .filter((item) => !!item);

    if (pathMatches.length === 0) {
      const msg = `link with path ${stringifiedPath} not found on source entity with entityId ${sourceEntity.entityId}`;
      throw new ApolloError(msg, `NOT_FOUND`);
    } else if (pathMatches.length > 1) {
      const msg = `multiple links with path ${stringifiedPath} found on source entity with entityId ${sourceEntity.entityId}`;
      throw new ApolloError(msg, `NOT_FOUND`);
    }

    jp.value(sourceEntity.properties, stringifiedPath, null);

    removeArrayNulls(sourceEntity.properties);

    await sourceEntity.updateEntityProperties(client, sourceEntity.properties);

    return true;
  });
