import { MutationLoginWithLoginCodeArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { verifyVerificationCode } from "./util";
import { UnresolvedGQLEntity } from "../../../model";

export const loginWithLoginCode: Resolver<
  UnresolvedGQLEntity,
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

      return user.toGQLUnknownEntity();
    })
  );
