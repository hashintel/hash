import { Subgraph } from "@local/hash-subgraph/main";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { QueryMeArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const meResolver: ResolverFn<
  Subgraph,
  {},
  LoggedInGraphQLContext,
  QueryMeArgs
> = async (_, { hasLeftEntity, hasRightEntity }, { user, dataSources }) => {
  return await getLatestEntityRootedSubgraph(
    dataSourcesToImpureGraphContext(dataSources),
    {
      entity: user.entity,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );
};
