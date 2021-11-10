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
> = async (_, { link }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const { sourceAccountId, sourceEntityId } = link;
    const sourceEntity = await Entity.getEntityLatestVersion(client, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    /** @todo: lock the entity on retrieval */

    if (!sourceEntity) {
      const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const {
      destinationAccountId,
      destinationEntityId,
      destinationEntityVersionId,
    } = link;
    const destinationEntity = destinationEntityVersionId
      ? await Entity.getEntity(client, {
          accountId: destinationAccountId,
          entityVersionId: destinationEntityVersionId,
        })
      : await Entity.getEntityLatestVersion(client, {
          accountId: destinationAccountId,
          entityId: destinationEntityId,
        });

    if (!destinationEntity) {
      const msg = `entity with fixed ID ${destinationEntityId}${
        destinationEntityVersionId
          ? ` and version ID ${destinationEntityVersionId}`
          : ""
      } not found in account ${destinationAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const { path: stringifiedPathWithoutIndex, index } = link;

    const stringifiedPath =
      typeof index === "number"
        ? `${stringifiedPathWithoutIndex}[${index}]`
        : stringifiedPathWithoutIndex;

    jp.value(sourceEntity.properties, stringifiedPath, {
      __linkedData: {
        entityId: destinationEntityId,
        entityVersionId: destinationEntityVersionId,
      },
    });

    await sourceEntity.updateEntityProperties(client, sourceEntity.properties);

    return { ...link, id: genId() };
  });
