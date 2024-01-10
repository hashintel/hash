import type { UserPermissions } from "@local/hash-isomorphic-utils/types";
import type { Entity } from "@local/hash-subgraph";

import {
  checkEntityPermission,
  checkPermissionsOnEntity,
} from "../../../../graph/knowledge/primitive/entity";
import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../../context";

export const checkUserPermissionsOnEntity: ResolverFn<
  UserPermissions,
  Pick<Entity, "metadata">,
  GraphQLContext,
  {}
> = async (entity, _, context) => {
  return checkPermissionsOnEntity(context.dataSources, context.authentication, {
    entity,
  });
};

export const canUserEdit: ResolverFn<
  boolean,
  Pick<Entity, "metadata">,
  LoggedInGraphQLContext,
  {}
> = async (entity, _, context) => {
  return checkEntityPermission(context.dataSources, context.authentication, {
    entityId: entity.metadata.recordId.entityId,
    permission: "update",
  });
};
