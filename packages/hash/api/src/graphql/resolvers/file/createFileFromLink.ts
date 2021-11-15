import { MutationCreateFileFromLinkArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { File, UnresolvedGQLUnknownEntity } from "../../../model";

export const createFileFromLink: Resolver<
  Promise<UnresolvedGQLUnknownEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromLinkArgs
> = async (_, { name, url, accountId }, { user, dataSources }) => {
  const createdById = user.entityId;
  const file = await File.createFileEntityFromLink(dataSources.db, {
    accountId,
    createdById,
    name,
    url,
  });
  return file.toGQLUnknownEntity();
};
