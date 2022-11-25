import { Subgraph } from "@hashintel/hash-subgraph";
import { ResolverFn, QueryMeArgs } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const me: ResolverFn<
  Subgraph,
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (_, { hasLeftEntity }, { userModel, dataSources: { graphApi } }) => {
  return await userModel.getRootedSubgraph(graphApi, {
    hasLeftEntity,
  });
};
