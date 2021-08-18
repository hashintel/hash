import { genId } from "../../../util";
import { DbUnknownEntity } from "../../../types/dbTypes";
import {
  MutationCreateEntityArgs,
  Resolver,
  Visibility,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const createEntity: Resolver<
  Promise<DbUnknownEntity>,
  {},
  GraphQLContext,
  MutationCreateEntityArgs
> = async (_, { accountId, properties, type, versioned }, { dataSources }) => {
  versioned = versioned ?? true;

  const dbEntity = await dataSources.db.createEntity({
    accountId,
    createdById: genId(), // TODO
    type,
    properties,
    versioned: versioned || false,
  });

  const entity: DbUnknownEntity = {
    ...dbEntity,
    id: dbEntity.entityVersionId,
    accountId: dbEntity.accountId,
    visibility: Visibility.Public, // TODO: should be a param?,
  };

  return entity;
};
