import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createEntity: Resolver<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { accountId, entity: entityDefinition },
  { dataSources, user },
) => {
  /** @todo restrict creation of protected types, e.g. User, Org */
  const entity = await Entity.createEntityWithLinks(dataSources.db, {
    user,
    accountId,
    entityDefinition,
  });

  return entity.toGQLUnknownEntity();
};
