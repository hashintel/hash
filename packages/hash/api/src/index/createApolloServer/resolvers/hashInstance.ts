import { Entity } from "@hashintel/hash-subgraph";
import { HashInstanceModel } from "../../auth/model";
import { ResolverFn } from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";

export const hashInstanceEntity: ResolverFn<
  Promise<Entity>,
  {},
  LoggedInGraphQLContext,
  {}
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const hashInstanceModel = await HashInstanceModel.getHashInstanceModel(
    graphApi,
  );

  return hashInstanceModel.entity;
};
