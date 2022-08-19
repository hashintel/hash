import {
  MutationDeprecatedCreateEntityTypeArgs,
  ResolverFn,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityType, UnresolvedGQLEntityType } from "../../../model";

export const deprecatedCreateEntityType: ResolverFn<
  Promise<UnresolvedGQLEntityType>,
  {},
  LoggedInGraphQLContext,
  MutationDeprecatedCreateEntityTypeArgs
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
