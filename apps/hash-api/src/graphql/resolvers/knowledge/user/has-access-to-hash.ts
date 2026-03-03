import { userHasAccessToHash } from "../../../../shared/user-has-access-to-hash";
import type { Query, ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

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
