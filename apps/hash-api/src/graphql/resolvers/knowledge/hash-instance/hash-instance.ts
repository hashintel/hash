import { getHashInstance } from "@local/hash-backend-utils/hash-instance";

import { checkEntityPermission } from "../../../../graph/knowledge/primitive/entity.js";
import type {
  HashInstanceSettings,
  ResolverFn,
} from "../../../api-types.gen.js";
import type { GraphQLContext } from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";

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
