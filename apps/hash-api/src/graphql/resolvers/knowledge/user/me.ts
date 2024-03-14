import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import type { Query, QueryMeArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { createSubgraphAndPermissionsReturn } from "../shared/create-subgraph-and-permissions-return";

export const meResolver: ResolverFn<
  Query["me"],
  Record<string, never>,
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (_, { hasLeftEntity, hasRightEntity }, graphQLContext, info) => {
  const { authentication, user } = graphQLContext;

  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const userSubgraph = await getLatestEntityRootedSubgraph(
    context,
    authentication,
    {
      entity: user.entity,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );

  return createSubgraphAndPermissionsReturn(graphQLContext, info, userSubgraph);
};
