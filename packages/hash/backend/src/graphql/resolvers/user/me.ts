import { Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { EntityWithIncompleteEntityType } from "../../../model/entityType.model";

export const me: Resolver<
  EntityWithIncompleteEntityType,
  {},
  LoggedInGraphQLContext
> = async (_, __, { user }) => user.toGQLUser();
