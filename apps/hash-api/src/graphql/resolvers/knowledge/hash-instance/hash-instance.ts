import { Entity } from "@local/hash-subgraph";

import { getHashInstance } from "../../../../graph/knowledge/system-types/hash-instance";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources, user }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);
  const authentication = { actorId: user.accountId };

  const hashInstance = await getHashInstance(context, authentication, {});

  return hashInstance.entity;
};
