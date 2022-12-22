import { Subgraph } from "@hashintel/hash-subgraph";
import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { ResolverFn, QueryMeArgs } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const meResolver: ResolverFn<
  Subgraph,
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (
  _,
  { hasLeftEntity, hasRightEntity },
  { user, dataSources: { graphApi } },
) => {
  return await getLatestEntityRootedSubgraph(
    { graphApi },
    {
      entity: user.entity,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );
};
