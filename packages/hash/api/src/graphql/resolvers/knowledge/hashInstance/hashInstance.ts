import { Entity } from "@hashintel/hash-subgraph";
import { HashInstanceModel } from "../../../../model";
import { ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";

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
