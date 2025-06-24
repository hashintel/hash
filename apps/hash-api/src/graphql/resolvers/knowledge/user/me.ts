import { serializeSubgraph } from "@local/hash-isomorphic-utils/subgraph-mapping";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import type { Query, QueryMeArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";
import { getUserPermissionsOnSubgraph } from "../shared/get-user-permissions-on-subgraph";

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
      entityId: user.entity.metadata.recordId.entityId,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );

  const userPermissionsOnEntities = await getUserPermissionsOnSubgraph(
    graphQLContext,
    info,
    userSubgraph,
  );

  return {
    subgraph: serializeSubgraph(userSubgraph),
    userPermissionsOnEntities,
  };
};
