import type { Subgraph } from "@blockprotocol/graph";

import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { createOrg } from "../../../../graph/knowledge/system-types/org";
import { createOrgMembershipLinkEntity } from "../../../../graph/knowledge/system-types/org-membership";
import type { MutationCreateOrgArgs, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

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

  /**
   * We need to create a link entity between the user and the org,
   * as the Graph does not automatically create this when a user creates an org
   * (it does create the permission system membership automatically).
   *
   * @todo H-4441 have the Graph handle memberOf link entity creation, as well as permisison handling.
   */
  await createOrgMembershipLinkEntity(context, authentication, {
    orgEntityId: org.entity.metadata.recordId.entityId,
    userEntityId: user.entity.metadata.recordId.entityId,
  });

  return await getLatestEntityRootedSubgraph(context, authentication, {
    entityId: org.entity.metadata.recordId.entityId,
    graphResolveDepths: {
      hasLeftEntity,
      hasRightEntity,
    },
  });
};
