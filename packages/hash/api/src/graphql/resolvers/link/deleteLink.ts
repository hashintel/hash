import { ApolloError } from "apollo-server-errors";
import { MutationDeleteLinkArgs, Resolver } from "../../apiTypes.gen";
import { Link } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const deleteLink: Resolver<
  Promise<boolean>,
  {},
  LoggedInGraphQLContext,
  MutationDeleteLinkArgs
> = (_, { sourceAccountId, linkId }, { dataSources, user }) =>
  dataSources.db.transaction(async (client) => {
    const link = await Link.get(client, { sourceAccountId, linkId });

    if (!link) {
      throw new ApolloError(
        `Link with sourceAccountId ${sourceAccountId} and linkId ${linkId} not found`,
        "NOT_FOUND",
      );
    }

    await link.delete(client, {
      deletedByAccountId: user.accountId,
    });

    return true;
  });
