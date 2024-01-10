import type { Entity } from "@local/hash-subgraph";

import { getHashInstance } from "../../../../graph/knowledge/system-types/hash-instance";
import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const hashInstance = await getHashInstance(context, authentication, {});

  return hashInstance.entity;
};
