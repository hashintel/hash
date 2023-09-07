import { Subgraph } from "@local/hash-subgraph";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { createOrg } from "../../../../graph/knowledge/system-types/org";
import { joinOrg } from "../../../../graph/knowledge/system-types/user";
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
  { name, shortname, orgSize, website, hasLeftEntity, hasRightEntity },
  { dataSources, user },
) => {
  const context = dataSourcesToImpureGraphContext(dataSources);
  const authentication = { actorId: user.accountId };

  const org = await createOrg(context, authentication, {
    shortname,
    name,
    providedInfo: orgSize ? { orgSize } : undefined,
    website,
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
