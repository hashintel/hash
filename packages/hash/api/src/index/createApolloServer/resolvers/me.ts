import { Subgraph } from "@hashintel/hash-subgraph";
import {
  ResolverFn,
  QueryMeArgs,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";

export const me: ResolverFn<
  Subgraph,
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (
  _,
  { hasLeftEntity, hasRightEntity },
  { userModel, dataSources: { graphApi } },
) => {
  return await userModel.getRootedSubgraph(graphApi, {
    hasLeftEntity,
    hasRightEntity,
  });
};
