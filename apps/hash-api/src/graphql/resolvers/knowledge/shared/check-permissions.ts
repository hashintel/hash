import type { Entity } from "@blockprotocol/type-system";
import type { UserPermissions } from "@local/hash-graph-sdk/authorization";

import {
  checkEntityPermission,
  checkPermissionsOnEntity,
} from "../../../../graph/knowledge/primitive/entity";
import type { ResolverFn } from "../../../api-types.gen";
import type { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
import { graphQLContextToImpureGraphContext } from "../../util";

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
      permission: "updateEntity",
    },
  );
};
