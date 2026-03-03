import { extractWebIdFromEntityId } from "@blockprotocol/type-system";

import { createFileFromUploadRequest } from "../../../../graph/knowledge/system-types/file";
import type {
  MutationRequestFileUploadArgs,
  RequestFileUploadResponse,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import * as Error from "../../../error";
import { graphQLContextToImpureGraphContext } from "../../util";
import { triggerPdfAnalysisWorkflow } from "./shared";

/**
 * We want to limit the size of files that can be uploaded to account
 * for potential issues when they are loaded into memory in the temporal
 * worker.
 *
 * @todo: figure out how to handle large files in temporal
 */
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
  const { authentication, temporal, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  if (size > maximumFileSizeInBytes) {
    throw Error.badUserInput(
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

  if (user.enabledFeatureFlags.includes("ai")) {
    await triggerPdfAnalysisWorkflow({
      entity,
      temporalClient: temporal,
      userAccountId: user.accountId,
      webId: extractWebIdFromEntityId(entity.entityId),
    });
  }

  return {
    presignedPut,
    entity: entity.toJSON(),
  };
};
