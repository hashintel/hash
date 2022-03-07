import { ApolloError } from "apollo-server-express";

import { MutationUpdateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";

export const updateEntityType: Resolver<
  Promise<UnresolvedGQLEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationUpdateEntityTypeArgs
> = async (
  _,
  { accountId, entityId, schema },
  { dataSources: { db }, user },
) => {
  return await db.transaction(async (conn) => {
    const entityType = await EntityType.getEntityType(db, {
      entityTypeId: entityId,
    });

    if (!entityType) {
      throw new ApolloError(
        `EntityType with entityId ${entityId} not found`,
        "NOT_FOUND",
      );
    }

    await entityType.update(conn, {
      accountId,
      updatedByAccountId: user.accountId,
      createdByAccountId: user.entityId,
      schema,
    });

    return entityType.toGQLEntityType();
  });
};
