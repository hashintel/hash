import { OwnedById } from "@local/hash-isomorphic-utils/types";

import { createFileFromExternalUrl } from "../../../../graph/knowledge/system-types/file";
import {
  MutationCreateFileFromUrlArgs,
  ResolverFn,
} from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { Entity } from "../hash-subgraph/src";

export const createFileFromUrl: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateFileFromUrlArgs
> = async (_, { mediaType, url }, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const entity = await createFileFromExternalUrl(context, {
    actorId: user.accountId,
    ownedById: user.accountId as OwnedById,
    mediaType,
    url,
  });

  return entity;
};
