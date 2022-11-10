import { ResolverFn, Subgraph, QueryMeArgs } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapSubgraphToGql } from "../../ontology/model-mapping";

export const me: ResolverFn<
  Subgraph,
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (
  _,
  { linkResolveDepth, linkTargetEntityResolveDepth },
  { userModel, dataSources: { graphApi } },
) => {
  const subgraph = await userModel.getRootedSubgraph(graphApi, {
    linkResolveDepth: linkResolveDepth ?? 0,
    linkTargetEntityResolveDepth: linkTargetEntityResolveDepth ?? 0,
  });

  return mapSubgraphToGql(subgraph);
};
