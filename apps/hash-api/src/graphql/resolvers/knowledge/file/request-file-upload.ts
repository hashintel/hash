import { Entity, OwnedById } from "@local/hash-subgraph";

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
> = async (
  _,
  { description, entityTypeId, displayName, name, ownedById, size },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { presignedPost, entity } = await createFileFromUploadRequest(
    context,
    authentication,
    {
      description,
      displayName,
      entityTypeId,
      name,
      ownedById: ownedById ?? (user.accountId as OwnedById),
      size,
    },
  );

  return {
    presignedPost,
    entity: entity as unknown as Entity,
  };
};
