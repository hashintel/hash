import { genId } from "../../../util";
import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity, EntityWithIncompleteEntityType } from "../../../model";

export const createEntity: Resolver<
  Promise<EntityWithIncompleteEntityType>,
  {},
  GraphQLContext,
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
  { dataSources }
) => {
  versioned = versioned ?? true;

  /** @todo restrict creation of protected types, e.g. User, Org */

  const entity = await Entity.create(dataSources.db)({
    accountId,
    createdById: genId(), // TODO
    entityTypeId: entityTypeId ?? undefined,
    entityTypeVersionId: entityTypeVersionId || undefined,
    systemTypeName: systemTypeName || undefined,
    properties,
    versioned: versioned || false,
  });

  return entity.toGQLUnknownEntity();
};
