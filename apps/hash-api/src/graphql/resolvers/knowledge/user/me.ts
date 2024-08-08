import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity.js";
import type { Query, QueryMeArgs, ResolverFn } from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";
import { createSubgraphAndPermissionsReturn } from "../shared/create-subgraph-and-permissions-return.js";

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
