import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";

import { Entity, EntityWithIncompleteEntityType } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createEntity: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  {
    accountId,
    properties,
    entityTypeId,
    entityTypeVersionId,
    systemTypeName,
    versioned,
  },
  { dataSources, user }
) => {
  versioned = versioned ?? true;

  /** @todo restrict creation of protected types, e.g. User, Org */

  const entity = await Entity.create(dataSources.db)({
    accountId,
    createdById: user.entityId,
    entityTypeId: entityTypeId ?? undefined,
    entityTypeVersionId: entityTypeVersionId || undefined,
    systemTypeName: systemTypeName || undefined,
    properties,
    versioned: versioned || false,
  });

  return entity.toGQLUnknownEntity();
};
