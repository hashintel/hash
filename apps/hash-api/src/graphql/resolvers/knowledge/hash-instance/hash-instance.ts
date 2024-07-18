import { getHashInstance } from "@local/hash-backend-utils/hash-instance";

import { checkEntityPermission } from "../../../../graph/knowledge/primitive/entity";
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

  const isUserAdmin = graphQLContext.user
    ? await checkEntityPermission(
        graphQLContextToImpureGraphContext(graphQLContext),
        graphQLContext.authentication,
        {
          entityId: entity.metadata.recordId.entityId,
          permission: "update",
        },
      )
    : false;

  return {
    entity: entity.toJSON(),
    isUserAdmin,
  };
};
