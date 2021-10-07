import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { createEntityArgsBuilder } from "../util";

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
  /** @todo restrict creation of protected types, e.g. User, Org */

  const entity = await Entity.create(dataSources.db)(
    createEntityArgsBuilder({
      accountId,
      createdById: user.entityId,
      properties,
      versioned: versioned ?? true,
      entityTypeId,
      entityTypeVersionId,
      systemTypeName,
    })
  );

  return entity.toGQLUnknownEntity();
};
