import type { Subgraph } from "@local/hash-subgraph";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { createOrg } from "../../../../graph/knowledge/system-types/org";
import { joinOrg } from "../../../../graph/knowledge/system-types/user";
import type { MutationCreateOrgArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { dataSourcesToImpureGraphContext } from "../../util";

export const createOrgResolver: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, websiteUrl, hasLeftEntity, hasRightEntity },
  { dataSources, authentication, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);

  const org = await createOrg(context, authentication, {
    shortname,
    name,
    websiteUrl,
  });

  await joinOrg(context, authentication, {
    orgEntityId: org.entity.metadata.recordId.entityId,
    userEntityId: user.entity.metadata.recordId.entityId,
  });

  return await getLatestEntityRootedSubgraph(context, authentication, {
    entity: org.entity,
    graphResolveDepths: {
      hasLeftEntity,
      hasRightEntity,
    },
  });
};
