import { MutationCreateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";

export const createEntityType: Resolver<
  Promise<UnresolvedGQLEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationCreateEntityTypeArgs
> = async (
  _,
  { accountId, description, name, schema },
  { dataSources, user },
) =>
  dataSources.db.transaction(async (client) => {
    const entityType = await EntityType.create(client, {
      accountId,
      createdByAccountId: user.accountId,
      description: description ?? undefined,
      name,
      schema,
    });
    return entityType.toGQLEntityType();
  });
