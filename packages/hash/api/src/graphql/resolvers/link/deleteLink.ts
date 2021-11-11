import { ApolloError } from "apollo-server-errors";
import { MutationDeleteLinkArgs, Resolver } from "../../apiTypes.gen";
import { Entity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLink: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkArgs
> = (_, { sourceAccountId, sourceEntityId, linkId }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const source = await Entity.getEntityLatestVersion(client, {
      accountId: sourceAccountId,
      entityId: sourceEntityId,
    });

    if (!source) {
      throw new ApolloError(
        `Link source entity with accountId ${sourceAccountId} and entityId ${sourceEntityId} not found`,
        "NOT_FOUND",
      );
    }

    await source.deleteOutgoingLink(client, { linkId });

    return true;
  });
