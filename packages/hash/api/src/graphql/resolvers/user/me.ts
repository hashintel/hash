import { Resolver } from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { mapUserModelToGQL, UnresolvedGQLUser } from "./util";

export const me: Resolver<
  UnresolvedGQLUser,
  {},
  LoggedInGraphQLContext
> = async (_, __, { user }) => mapUserModelToGQL(user);
