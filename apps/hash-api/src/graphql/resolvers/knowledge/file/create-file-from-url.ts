import { File as FileEntityType } from "@local/hash-isomorphic-utils/system-types/file";
import { OwnedById } from "@local/hash-subgraph";

import { createFileFromExternalUrl } from "../../../../graph/knowledge/system-types/file";
import {
  MutationCreateFileFromUrlArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const createFileFromUrl: ResolverFn<
  Promise<FileEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromUrlArgs
> = async (
  _,
  { description, entityTypeId, ownedById, displayName, url },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const entity = await createFileFromExternalUrl(context, authentication, {
    description,
    displayName,
    entityTypeId,
    ownedById: ownedById ?? (user.accountId as OwnedById),
    url,
  });

  return entity;
};
