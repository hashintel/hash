import { genId } from "../../../util";
import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { dbEntityToGraphQLEntity } from "../../util";
import { EntityWithIncompleteEntityType } from "../../../model";

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

  const entity = await dataSources.db.createEntity({
    accountId,
    createdById: genId(), // TODO
    entityTypeId: entityTypeId ?? undefined,
    entityTypeVersionId,
    systemTypeName,
    properties,
    versioned: versioned || false,
  });

  return dbEntityToGraphQLEntity(entity);
};
