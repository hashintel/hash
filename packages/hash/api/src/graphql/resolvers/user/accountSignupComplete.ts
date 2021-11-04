import { User } from "../../../model";
import { Resolver, User as GQLUser } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const accountSignupComplete: Resolver<
  Promise<GQLUser["accountSignupComplete"]>,
  GQLUser,
  GraphQLContext
> = async ({ properties }) => User.isAccountSignupComplete(properties);
