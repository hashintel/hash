import { User } from "../../../model";
import { ResolverFn, User as GQLUser } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const accountSignupComplete: ResolverFn<
  Promise<GQLUser["accountSignupComplete"]>,
  GQLUser,
  GraphQLContext,
  {}
> = async ({ properties }) => User.isAccountSignupComplete(properties);
