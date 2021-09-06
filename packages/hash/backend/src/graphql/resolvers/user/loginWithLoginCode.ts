import { MutationLoginWithLoginCodeArgs, Resolver } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { verifyVerificationCode } from "./util";
import { EntityWithIncompleteEntityType } from "../../../model/entityType.model";

export const loginWithLoginCode: Resolver<
  EntityWithIncompleteEntityType,
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
