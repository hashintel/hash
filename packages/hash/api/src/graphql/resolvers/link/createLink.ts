import { ApolloError } from "apollo-server-errors";
import { MutationCreateLinkArgs, Resolver } from "../../apiTypes.gen";
import { Entity, UnresolvedGQLLink } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createLink: Resolver<
  Promise<UnresolvedGQLLink>,
  {},
  LoggedInGraphQLContext,
  MutationCreateLinkArgs
> = async (_, { link: linkInput }, { dataSources, user }) =>
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

    const { destinationAccountId, destinationEntityId } = linkInput;

    const destination = await Entity.getEntityLatestVersion(client, {
      accountId: destinationAccountId,
      entityId: destinationEntityId,
    });

    if (!destination) {
      const msg = `entity with fixed ID ${destinationEntityId} not found in account ${destinationAccountId}`;
      throw new ApolloError(msg, "NOT_FOUND");
    }

    const link = await source.createOutgoingLink(client, {
      createdByAccountId: user.accountId,
      stringifiedPath: linkInput.path,
      index: typeof linkInput.index === "number" ? linkInput.index : undefined,
      destination,
    });

    return link.toUnresolvedGQLLink();
  });
