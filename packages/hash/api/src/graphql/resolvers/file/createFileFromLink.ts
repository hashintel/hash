import { genId } from "../../../util";
import { MutationCreateFileFromLinkArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { File, UnresolvedGQLUnknownEntity } from "../../../model";

function guessFileNameFromURL(url: string): string {
  const fileNameRegex = /[^/\\&?]+\w+(?=([?&].*$|$))/;
  const fileName = url.match(fileNameRegex);
  if (fileName && fileName.length > 0) {
    return fileName[0]!;
  } else {
    return genId();
  }
}

export const createFileFromLink: Resolver<
  Promise<UnresolvedGQLUnknownEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromLinkArgs
> = async (_, { name, url, accountId }, { user, dataSources }) => {
  const createdByAccountId = user.entityId;
  const fileName = name || guessFileNameFromURL(url);
  const file = await File.createFileEntityFromLink(dataSources.db, {
    accountId,
    createdByAccountId,
    name: fileName,
    url,
  });
  return file.toGQLUnknownEntity();
};
