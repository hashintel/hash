/** @todo - Fix Files - https://app.asana.com/0/1202805690238892/1203418451117503/f */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import {
  MutationRequestFileUploadArgs,
  ResolverFn,
  RequestFileUploadResponse,
  File as GQLFile,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";
import { File } from "../../auth/model";

export const requestFileUpload: ResolverFn<
  Promise<RequestFileUploadResponse>,
  {},
  LoggedInGraphQLContext,
  MutationRequestFileUploadArgs
> = async (_, { name, contentMd5, size }, { userModel, dataSources }) => {
  const accountId = userModel.getEntityUuid();
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
