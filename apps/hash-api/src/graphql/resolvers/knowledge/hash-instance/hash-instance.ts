import {
  getHashInstance,
  isUserHashInstanceAdmin,
} from "@local/hash-backend-utils/hash-instance";

import type { HashInstanceSettings, ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

export const hashInstanceSettingsResolver: ResolverFn<
  Promise<HashInstanceSettings>,
  Record<string, never>,
  GraphQLContext,
  Record<string, never>
> = async (_, __, graphQLContext) => {
  const { authentication } = graphQLContext;
  const context = graphQLContextToImpureGraphContext(graphQLContext);

  const { entity } = await getHashInstance(context, authentication);

  const isUserAdmin = await isUserHashInstanceAdmin(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    { userAccountId: authentication.actorId },
  );

  return {
    entity: entity.toJSON(),
    isUserAdmin,
  };
};
