import type { Entity } from "@local/hash-graph-sdk/entity";
import type { UserPermissions } from "@local/hash-isomorphic-utils/types";

import {
  checkEntityPermission,
  checkPermissionsOnEntity,
} from "../../../../graph/knowledge/primitive/entity.js";
import type { ResolverFn } from "../../../api-types.gen.js";
import type {
  GraphQLContext,
  LoggedInGraphQLContext,
} from "../../../context.js";
import { graphQLContextToImpureGraphContext } from "../../util.js";

export const checkUserPermissionsOnEntity: ResolverFn<
  UserPermissions,
  Pick<Entity, "metadata">,
  GraphQLContext,
  Record<string, never>
> = async (entity, _, graphQLContext) => {
  return checkPermissionsOnEntity(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      entity,
    },
  );
};

export const canUserEdit: ResolverFn<
  boolean,
  Pick<Entity, "metadata">,
  LoggedInGraphQLContext,
  Record<string, never>
> = async (entity, _, graphQLContext) => {
  return checkEntityPermission(
    graphQLContextToImpureGraphContext(graphQLContext),
    graphQLContext.authentication,
    {
      entityId: entity.metadata.recordId.entityId,
      permission: "update",
    },
  );
};
