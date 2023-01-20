import { getHashInstance } from "../../../../graph/knowledge/system-types/hash-instance";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { Entity } from "../hash-subgraph/src";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const hashInstance = await getHashInstance(context, {});

  return hashInstance.entity;
};
