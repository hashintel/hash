import {
  MutationLoginWithLoginCodeArgs,
  Resolver,
  User as GQLUser,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { verifyVerificationCode } from "./util";

export const loginWithLoginCode: Resolver<
  GQLUser,
  {},
  GraphQLContext,
  MutationLoginWithLoginCodeArgs
> = async (_, args, { dataSources, passport }) =>
  dataSources.db.transaction((client) =>
    verifyVerificationCode(client)({
      id: args.verificationId,
      code: args.verificationCode,
    }).then(async ({ user }) => {
      await passport.login(user, {});
      return user.toGQLUser();
    })
  );
