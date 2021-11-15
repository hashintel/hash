import {
  MutationRequestFileUploadArgs,
  Resolver,
  RequestFileUploadResponse,
  File as GQLFile,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { File } from "../../../model";

export const requestFileUpload: Resolver<
  Promise<RequestFileUploadResponse>,
  {},
  LoggedInGraphQLContext,
  MutationRequestFileUploadArgs
> = async (
  _,
  { name, contentMd5, size },
  { user, dataSources, uploadProvider },
) => {
  const accountId = user.entityId;
  const { presignedPost, file } = await File.createFileEntityFromUploadRequest(
    dataSources.db,
    uploadProvider,
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
