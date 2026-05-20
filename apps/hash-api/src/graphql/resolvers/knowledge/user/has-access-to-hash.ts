import { userHasAccessToHash } from "../../../../shared/user-has-access-to-hash";
import { graphQLContextToImpureGraphContext } from "../../util";

import type { Query, ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";

export const hasAccessToHashResolver: ResolverFn<
  Query["hasAccessToHash"],
  Record<string, never>,
  GraphQLContext,
  Record<string, never>
> = async (_, __, context) => {
  return userHasAccessToHash(
    graphQLContextToImpureGraphContext(context),
    context.authentication,
    context.user ?? null,
  );
};
