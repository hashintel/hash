import { genId } from "../../../util";
import { Entity } from "../../../db/adapter";
import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const createEntity: Resolver<
  Promise<Entity>,
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

  return dataSources.db.createEntity({
    accountId,
    createdById: genId(), // TODO
    entityTypeId,
    entityTypeVersionId,
    systemTypeName,
    properties,
    versioned: versioned || false,
  });
};
