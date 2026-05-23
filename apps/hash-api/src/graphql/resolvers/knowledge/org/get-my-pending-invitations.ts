import { getUserPendingInvitations } from "../../../../graph/knowledge/system-types/user";
import { graphQLContextToImpureGraphContext } from "../../util";

import type { ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import type { PendingOrgInvitation } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

export const getMyPendingInvitationsResolver: ResolverFn<
  Promise<PendingOrgInvitation[]>,
  Record<string, never>,
  LoggedInGraphQLContext,
  null
> = async (_, _args, graphQLContext) => {
  const { user } = graphQLContext;

  return getUserPendingInvitations(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    { user },
  );
};
