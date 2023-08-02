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

  const org = await createOrg(context, {
    shortname,
    name,
    providedInfo: orgSize ? { orgSize } : undefined,
    actorId: user.accountId,
    website,
  });

  await joinOrg(context, {
    actorId: user.accountId,
    orgEntityId: org.entity.metadata.recordId.entityId,
    responsibility: "Owner",
    userEntityId: user.entity.metadata.recordId.entityId,
  });

  return await getLatestEntityRootedSubgraph(context, {
    entity: org.entity,
    graphResolveDepths: {
      hasLeftEntity,
      hasRightEntity,
    },
  });
};
