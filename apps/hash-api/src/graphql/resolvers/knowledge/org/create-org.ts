import { Subgraph } from "@local/hash-subgraph/main";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { createOrg } from "../../../../graph/knowledge/system-types/org";
import { MutationCreateOrgArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const createOrgResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, orgSize, hasLeftEntity, hasRightEntity },
  { dataSources, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const org = await createOrg(context, {
    shortname,
    name,
    providedInfo: { orgSize },
    actorId: user.accountId,
  });

  return await getLatestEntityRootedSubgraph(context, {
    entity: org.entity,
    graphResolveDepths: {
      hasLeftEntity,
      hasRightEntity,
    },
  });
};
