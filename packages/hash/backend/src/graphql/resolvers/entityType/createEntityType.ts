import { MutationCreateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityType, EntityTypeWithoutTypeFields } from "../../../model";

export const createEntityType: Resolver<
  Promise<EntityTypeWithoutTypeFields>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (
  _,
  { accountId, description, name, schema },
  { dataSources, user }
) =>
  dataSources.db.transaction(async (client) => {
    const entityType = await EntityType.create(client)({
      accountId,
      createdById: user.entityId,
      description,
      name,
      schema,
    });
    return entityType.toGQLEntityType();
  });
