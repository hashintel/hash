import { OwnedById } from "@local/hash-subgraph/src/types";

import { createFileFromUploadRequest } from "../../../../graph/knowledge/system-types/file";
import {
  MutationRequestFileUploadArgs,
  RequestFileUploadResponse,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const requestFileUpload: ResolverFn<
  Promise<RequestFileUploadResponse>,
  {},
  LoggedInGraphQLContext,
  MutationRequestFileUploadArgs
> = async (_, { mediaType, size }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { presignedPost, entity } = await createFileFromUploadRequest(context, {
    actorId: user.accountId,
    ownedById: user.accountId as OwnedById,
    mediaType,
    size,
  });

  return {
    presignedPost,
    entity,
  };
};
