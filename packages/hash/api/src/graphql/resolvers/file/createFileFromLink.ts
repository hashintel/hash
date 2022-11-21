/** @todo - Fix this file */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { genId } from "../../../util";
import {
  EntityWithMetadata,
  MutationCreateFileFromLinkArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { File } from "../../../model";

function guessFileNameFromURL(url: string): string {
  const fileNameRegex = /[^/\\&?]+\w+(?=([?&].*$|$))/;
  const fileName = url.match(fileNameRegex);
  if (fileName && fileName.length > 0) {
    return fileName[0]!;
  } else {
    return genId();
  }
}

export const createFileFromLink: ResolverFn<
  Promise<EntityWithMetadata>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromLinkArgs
> = async (_, { name, url, accountId }, { userModel, dataSources }) => {
  const createdByAccountId = userModel.entityUuid;
  const fileName = name || guessFileNameFromURL(url);
  const file = await File.createFileEntityFromLink(dataSources.db, {
    accountId,
    createdByAccountId,
    name: fileName,
    url,
  });
  /** @todo - map to GraphQL */
  return file;
};
