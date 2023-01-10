import { Entity } from "@hashintel/hash-subgraph";

import { getHashInstance } from "../../../../graph/knowledge/system-types/hash-instance";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const context = dataSourceToImpureGraphContext(dataSources);

  const hashInstance = await getHashInstance(context, {});

  return hashInstance.entity;
};
