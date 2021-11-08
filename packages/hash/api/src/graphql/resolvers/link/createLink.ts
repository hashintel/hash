import { ApolloError } from "apollo-server-errors";
import jp from "jsonpath";
import {
  MutationCreateLinkArgs,
  Link as GQLLink,
  Resolver,
} from "../../apiTypes.gen";
import { Entity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { genId } from "../../../util";

export const createLink: Resolver<
  Promise<GQLLink>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkArgs
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

    const { dstAccountId, dstEntityId, dstEntityVersionId } = args;
    const dstEntity = dstEntityVersionId
      ? await Entity.getEntity(client, {
          accountId: dstAccountId,
          entityVersionId: dstEntityVersionId,
        })
      : await Entity.getEntityLatestVersion(client, {
          accountId: dstAccountId,
          entityId: dstEntityId,
        });

    if (!dstEntity) {
      const msg = `entity with fixed ID ${dstEntityId}${
        dstEntityVersionId ? ` and version ID ${dstEntityVersionId}` : ""
      } not found in account ${dstAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const { path: stringifiedPath } = args;

    jp.value(sourceEntity.properties, stringifiedPath, {
      __linkedData: {
        entityId: dstEntityId,
        entityVersionId: dstEntityVersionId,
      },
    });

    await sourceEntity.updateEntityProperties(client, sourceEntity.properties);

    return { ...args, id: genId() };
  });
