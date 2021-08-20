import { genId } from "../../../util";
import { MutationCreateUserArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { Entity } from "../../../db/adapter";

export const createUser: Resolver<
  Promise<Entity>,
  {},
  GraphQLContext,
  MutationCreateUserArgs
> = async (_, { email, shortname }, { dataSources }) => {
  const id = genId();
  // TODO: should check for uniqueness of email

  return dataSources.db.createEntity({
    accountId: id,
    entityVersionId: id,
    createdById: id, // Users "create" themselves
    systemTypeName: "User",
    properties: { email, shortname },
    versioned: false, // @todo: should user's be versioned?
  });
};
