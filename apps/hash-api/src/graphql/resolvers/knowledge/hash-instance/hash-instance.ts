import { getHashInstance } from "@local/hash-backend-utils/hash-instance";
import { Entity } from "@local/hash-subgraph";

import { ResolverFn } from "../../../api-types.gen";
import { GraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  GraphQLContext,
  {}
> = async (_, __, { dataSources, authentication }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const hashInstance = await getHashInstance(context, authentication);

  return hashInstance.entity;
};
