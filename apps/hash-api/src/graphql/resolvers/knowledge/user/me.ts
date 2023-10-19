import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { Query, QueryMeArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";
import { createSubgraphAndPermissionsReturn } from "../shared/create-subgraph-and-permissions-return";

export const meResolver: ResolverFn<
  Query["me"],
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (
  _,
  { hasLeftEntity, hasRightEntity },
  { dataSources, authentication, user },
  info,
) => {
  const userSubgraph = await getLatestEntityRootedSubgraph(
    dataSourcesToImpureGraphContext(dataSources),
    authentication,
    {
      entity: user.entity,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );

  return createSubgraphAndPermissionsReturn(
    { dataSources, authentication },
    info,
    userSubgraph,
  );
};
