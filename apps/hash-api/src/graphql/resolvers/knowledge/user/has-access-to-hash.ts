import { userHasAccessToHash } from "../../../../shared/user-has-access-to-hash";
import type { Query, ResolverFn } from "../../../api-types.gen";
import type { LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  Record<string, never>,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (_, __, context) => {
  return userHasAccessToHash(
    graphQLContextToImpureGraphContext(context),
    context.authentication,
    context.user,
  );
};
