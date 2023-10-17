import { Entity } from "@local/hash-subgraph";

import { canUpdateEntity } from "../../../../graph/knowledge/primitive/entity";
import { ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const canUserEdit: ResolverFn<
  boolean,
  Pick<Entity, "metadata">,
  LoggedInGraphQLContext,
  {}
> = async (entity, _, context) => {
  return canUpdateEntity(context.dataSources, context.authentication, {
    entityId: entity.metadata.recordId.entityId,
  });
};
