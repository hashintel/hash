import { Entity } from "@local/hash-subgraph";
import { UserInputError } from "apollo-server-errors";

import { createFileFromUploadRequest } from "../../../../graph/knowledge/system-types/file";
import {
  MutationRequestFileUploadArgs,
  RequestFileUploadResponse,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

const maximumFileSizeInMegaBytes = 100;

const maximumFileSizeInBytes = maximumFileSizeInMegaBytes * 1024 * 1024;

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
  graphQLContext,
) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  if (size > maximumFileSizeInBytes) {
    throw new UserInputError(
      `The file size must be less than ${maximumFileSizeInMegaBytes} MB`,
    );
  }

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
