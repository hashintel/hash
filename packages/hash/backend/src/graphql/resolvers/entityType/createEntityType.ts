import { genId } from "../../../util";
import { MutationCreateEntityTypeArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import EntityType, {
  EntityTypeWithoutTypeFields,
} from "../../../model/entityType.model";

export const createEntityType: Resolver<
  Promise<EntityTypeWithoutTypeFields>,
  {},
  GraphQLContext,
  MutationCreateEntityTypeArgs
> = async (_, { accountId, name, schema }, { dataSources }) =>
  dataSources.db.transaction(async (client) => {
    const entityType = await EntityType.create(client)({
      accountId,
      createdById: genId(), // TODO
      name,
      schema,
    });
    return entityType.toGQLEntityType();
  });
