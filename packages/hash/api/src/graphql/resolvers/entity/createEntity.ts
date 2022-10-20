import { MutationCreateEntityArgs, ResolverFn } from "../../apiTypes.gen";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";

export const createEntity: ResolverFn<
  Promise<UnresolvedGQLEntity>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityArgs
> = async (
  _,
  { accountId, entity: entityDefinition },
  { dataSources, userModel },
) => {
  /** @todo restrict creation of protected types, e.g. User, Org */
  const entity = await Entity.createEntityWithLinks(dataSources.db, {
    user: userModel as any /** @todo: replace with updated model class */,
    accountId,
    entityDefinition,
  });

  return entity.toGQLUnknownEntity();
};
