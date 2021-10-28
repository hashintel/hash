import { ApolloError } from "apollo-server-errors";
import { MutationCreateLinkArgs, Resolver } from "../../apiTypes.gen";
import { Entity, Link, UnresolvedGQLLink } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createLink: Resolver<
  Promise<UnresolvedGQLLink>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkArgs
> = async (_, { link: linkInput }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const { sourceAccountId, sourceEntityId } = linkInput;
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    /** @todo: lock the entity on retrieval */

    if (!source) {
      const msg = `entity with fixed ID ${sourceEntityId} not found in account ${sourceAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const {
      destinationAccountId,
      destinationEntityId,
      destinationEntityVersionId,
    } = linkInput;

    const destination = destinationEntityVersionId
      ? await Entity.getEntity(client, {
          accountId: destinationAccountId,
          entityVersionId: destinationEntityVersionId,
        })
      : await Entity.getEntityLatestVersion(client, {
          accountId: destinationAccountId,
          entityId: destinationEntityId,
        });

    if (!destination) {
      const msg = `entity with fixed ID ${destinationEntityId}${
        destinationEntityVersionId
          ? ` and version ID ${destinationEntityVersionId}`
          : ""
      } not found in account ${destinationAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const { path } = linkInput;

    Link.validatePath(path);

    const link = await Link.create(client)({
      path,
      source,
      destination,
      dstEntityVersionId: destinationEntityVersionId || undefined,
    });

    return link.toUnresolvedGQLLink();
  });
