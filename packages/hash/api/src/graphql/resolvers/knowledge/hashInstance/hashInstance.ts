import { EntityWithMetadata } from "@hashintel/hash-subgraph";
import { HashInstanceModel } from "../../../../model";
import {
  ResolverFn,
  QueryGetAllLatestEntitiesWithMetadataArgs,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const hashInstanceEntity: ResolverFn<
  Promise<EntityWithMetadata>,
  {},
  LoggedInGraphQLContext,
  QueryGetAllLatestEntitiesWithMetadataArgs
> = async (_, __, { dataSources }) => {
  const { graphApi } = dataSources;

  const hashInstanceModel = await HashInstanceModel.getHashInstanceModel(
    graphApi,
  );

  return hashInstanceModel.entity;
};
