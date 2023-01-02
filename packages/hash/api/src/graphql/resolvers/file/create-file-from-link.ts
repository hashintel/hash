/** @todo - Fix Files - https://app.asana.com/0/1202805690238892/1203418451117503/f */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { File } from "../../../model";
import { genId } from "../../../util";
import {
  Entity,
  MutationCreateFileFromLinkArgs,
  ResolverFn,
} from "../../api-types.gen";
import { LoggedInGraphQLContext } from "../../context";

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
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromLinkArgs
> = async (_, { name, url, accountId }, { userModel, dataSources }) => {
  const createdByAccountId = userModel.getEntityUuid();
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
