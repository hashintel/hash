import { UserPermissions } from "@local/hash-isomorphic-utils/types";
import { Entity } from "@local/hash-subgraph";

import {
  checkEntityPermission,
  checkPermissionsOnEntity,
} from "../../../../graph/knowledge/primitive/entity";
import { ResolverFn } from "../../../api-types.gen";
import { GraphQLContext, LoggedInGraphQLContext } from "../../../context";
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
      permission: "update",
    },
  );
};
