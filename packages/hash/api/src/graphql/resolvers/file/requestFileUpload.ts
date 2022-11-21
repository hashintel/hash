/** @todo - Fix this file */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {
  MutationRequestFileUploadArgs,
  ResolverFn,
  RequestFileUploadResponse,
  File as GQLFile,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { File } from "../../../model";

export const requestFileUpload: ResolverFn<
  Promise<RequestFileUploadResponse>,
  {},
  LoggedInGraphQLContext,
  MutationRequestFileUploadArgs
> = async (_, { name, contentMd5, size }, { userModel, dataSources }) => {
  const accountId = userModel.entityUuid;
  const { presignedPost, file } = await File.createFileEntityFromUploadRequest(
    dataSources.db,
    {
      name,
      contentMd5,
      size,
      accountId,
    },
  );
  return {
    presignedPost,
    file: file.toGQLUnknownEntity() as GQLFile,
  };
};
