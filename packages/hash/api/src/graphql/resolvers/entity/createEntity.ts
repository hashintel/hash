import { MutationCreateEntityArgs, Resolver } from "../../apiTypes.gen";
import { Entity, UnresolvedGQLEntity } from "../../../model";
import { LoggedInGraphQLContext } from "../../context";
import { createEntityArgsBuilder } from "../util";

export const createEntity: Resolver<
  Promise<UnresolvedGQLEntity>,
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
  { dataSources, user },
) => {
  /** @todo restrict creation of protected types, e.g. User, Org */

  const entity = await Entity.create(
    dataSources.db,
    createEntityArgsBuilder({
      accountId,
      createdByAccountId: user.accountId,
      properties,
      versioned: versioned ?? true,
      entityTypeId,
      entityTypeVersionId,
      systemTypeName,
    }),
  );

  return entity.toGQLUnknownEntity();
};
