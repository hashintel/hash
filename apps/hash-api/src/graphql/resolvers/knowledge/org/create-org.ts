import type { Subgraph } from "@local/hash-subgraph";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity.js";
import { createOrg } from "../../../../graph/knowledge/system-types/org.js";
import { joinOrg } from "../../../../graph/knowledge/system-types/user.js";
import type {
  MutationCreateOrgArgs,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { LoggedInGraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";

export const createOrgResolver: ResolverFn<
  Promise<Subgraph>,
  Record<string, never>,
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, websiteUrl, hasLeftEntity, hasRightEntity },
  graphQLContext,
) => {
  const { authentication, user } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

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
