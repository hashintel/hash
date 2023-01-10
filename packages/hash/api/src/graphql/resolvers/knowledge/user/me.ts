import { Subgraph } from "@hashintel/hash-subgraph";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { QueryMeArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourceToImpureGraphContext } from "../../util";

export const meResolver: ResolverFn<
  Subgraph,
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (_, { hasLeftEntity, hasRightEntity }, { user, dataSources }) => {
  return await getLatestEntityRootedSubgraph(
    dataSourceToImpureGraphContext(dataSources),
    {
      entity: user.entity,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );
};
