import { Subgraph } from "@hashintel/hash-subgraph";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { createOrg } from "../../../../graph/knowledge/system-types/org";
import { MutationCreateOrgArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const createOrgResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, orgSize, hasLeftEntity, hasRightEntity },
  { dataSources: { graphApi }, user },
) => {
  const org = await createOrg(
    { graphApi },
    {
      shortname,
      name,
      providedInfo: { orgSize },
      actorId: user.accountId,
    },
  );

  return await getLatestEntityRootedSubgraph(
    { graphApi },
    {
      entity: org.entity,
      graphResolveDepths: {
        hasLeftEntity,
        hasRightEntity,
      },
    },
  );
};
