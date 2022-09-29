import { ApolloError } from "apollo-server-errors";
import { UserModel } from "../../../model";
import { ResolverFn, User as GQLUser } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";

export const accountSignupComplete: ResolverFn<
  Promise<GQLUser["accountSignupComplete"]>,
  GQLUser,
  GraphQLContext,
  {}
> = async ({ entityId }, _, { dataSources: { graphApi } }) => {
  const userModel = await UserModel.getUserById(graphApi, { entityId });

  if (!userModel) {
    const msg = `User with entityId ${entityId} not found in graph`;
    throw new ApolloError(msg, "NOT_FOUND");
  }

  return userModel.isAccountSignupComplete();
};
