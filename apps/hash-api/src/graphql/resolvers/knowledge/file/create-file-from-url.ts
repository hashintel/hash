import type { Entity } from "@local/hash-graph-sdk/entity";
import type { File as FileEntity } from "@local/hash-isomorphic-utils/system-types/shared";

import { createFileFromExternalUrl } from "../../../../graph/knowledge/system-types/file";
import type {
  MutationCreateFileFromUrlArgs,
  ResolverFn,
} from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

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
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const entity = await createFileFromExternalUrl(context, authentication, {
    description,
    displayName,
    fileEntityCreationInput,
    fileEntityUpdateInput,
    url,
  });

  return entity;
};
