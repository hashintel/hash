import { Entity } from "@local/hash-subgraph";

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
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationRequestFileUploadArgs
> = async (
  _,
  {
    description,
    displayName,
    fileEntityCreationInput,
    fileEntityUpdateInput,
    name,
    size,
  },
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const { presignedPut, entity } = await createFileFromUploadRequest(
    context,
    authentication,
    {
      description,
      displayName,
      fileEntityCreationInput,
      fileEntityUpdateInput,
      name,
      size,
    },
  );

  return {
    presignedPut,
    entity: entity as unknown as Entity,
  };
};
