import { Entity } from "@hashintel/hash-subgraph";

import { getHashInstance } from "../../../../graph/knowledge/system-types/hash-instance";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const hashInstanceEntityResolver: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const hashInstance = await getHashInstance({ graphApi }, {});

  return hashInstance.entity;
};
