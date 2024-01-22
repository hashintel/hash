import { File as FileEntityType } from "@local/hash-isomorphic-utils/system-types/file";

import { createFileFromExternalUrl } from "../../../../graph/knowledge/system-types/file";
import {
  MutationCreateFileFromUrlArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const createFileFromUrl: ResolverFn<
  Promise<FileEntityType>,
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
  { dataSources, authentication },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const entity = await createFileFromExternalUrl(context, authentication, {
    description,
    displayName,
    fileEntityCreationInput,
    fileEntityUpdateInput,
    url,
  });

  return entity;
};
