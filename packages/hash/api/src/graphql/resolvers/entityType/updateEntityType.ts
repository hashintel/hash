import { ApolloError } from "apollo-server-express";

import {
  MutationDeprecatedUpdateEntityTypeArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";

export const deprecatedUpdateEntityType: ResolverFn<
  Promise<UnresolvedGQLEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationDeprecatedUpdateEntityTypeArgs
> = async (_, { entityId, schema }, { dataSources: { db }, userModel }) => {
  return await db.transaction(async (conn) => {
    const entityType = await EntityType.getEntityType(conn, {
      entityTypeId: entityId,
    });

    if (!entityType) {
      throw new ApolloError(
        `EntityType with entityId ${entityId} not found`,
        "NOT_FOUND",
      );
    }

    await entityType.update(conn, {
      updatedByAccountId: userModel.entityId,
      createdByAccountId: userModel.entityId,
      schema,
    });

    return entityType.toGQLEntityType();
  });
};
