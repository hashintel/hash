import { RemoteFile } from "@local/hash-isomorphic-utils/system-types/blockprotocol/remote-file";
import { OwnedById } from "@local/hash-subgraph";

import { createFileFromExternalUrl } from "../../../../graph/knowledge/system-types/file";
import {
  MutationCreateFileFromUrlArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const createFileFromUrl: ResolverFn<
  Promise<RemoteFile>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromUrlArgs
> = async (
  _,
  { description, entityTypeId, ownedById, name, url },
  { dataSources, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);
  const authentication = { actorId: user.accountId };

  const entity = await createFileFromExternalUrl(context, authentication, {
    description,
    entityTypeId,
    name,
    ownedById: ownedById ?? (user.accountId as OwnedById),
    url,
  });

  return entity;
};
