import type { Entity } from "@blockprotocol/type-system";
import { extractWebIdFromEntityId } from "@blockprotocol/type-system";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";

import { createFileFromExternalUrl } from "../../../../graph/knowledge/system-types/file";
import type {
  MutationCreateFileFromUrlArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { triggerPdfAnalysisWorkflow } from "./shared";

export const createFileFromUrl: ResolverFn<
  Promise<Entity<FileEntity>>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateFileFromUrlArgs
> = async (
  _,
  {
    description,
    fileEntityCreationInput,
    fileEntityUpdateInput,
    displayName,
    url,
  },
  graphQLContext,
) => {
  const { authentication, temporal, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const entity = await createFileFromExternalUrl(context, authentication, {
    description,
    displayName,
    fileEntityCreationInput,
    fileEntityUpdateInput,
    url,
  });

  if (user.enabledFeatureFlags.includes("ai")) {
    await triggerPdfAnalysisWorkflow({
      entity,
      temporalClient: temporal,
      userAccountId: authentication.actorId,
      webId: extractWebIdFromEntityId(entity.entityId),
    });
  }

  return entity;
};
