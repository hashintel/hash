import { MutationUpdateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";

export const updateEntityType: Resolver<
  Promise<UnresolvedGQLEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (_, { accountId, entityId, schema }, { dataSources, user }) => {
  const entityType = await EntityType.updateSchema(dataSources.db, {
    accountId,
    createdById: user.entityId,
    entityId,
    schema,
  });
  return entityType.toGQLEntityType();
};
