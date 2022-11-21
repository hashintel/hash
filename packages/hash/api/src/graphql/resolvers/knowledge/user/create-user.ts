import { Subgraph } from "@hashintel/hash-subgraph";
import { createKratosIdentity } from "../../../../auth/ory-kratos";
import { UserModel } from "../../../../model";
import { MutationCreateUserArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const createUser: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateUserArgs
> = async (
  _,
  {
    emailAddress,
    password,
    isInstanceAdmin,
    shortname,
    preferredName,
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  },
  { dataSources: { graphApi }, userModel: actorUserModel },
) => {
  const kratosIdentity = await createKratosIdentity({
    traits: {
      shortname: shortname ?? undefined,
      emails: [emailAddress],
    },
    credentials: { password: { config: { password } } },
  });

  /**
   * @todo: use kratos admin API to programmatically verify the email of the user
   *
   * @see https://github.com/ory/kratos/issues/2473
   */

  const { id: kratosIdentityId } = kratosIdentity;

  const userModel = await UserModel.createUser(graphApi, {
    emails: [emailAddress],
    shortname: shortname ?? undefined,
    preferredName: preferredName ?? undefined,
    kratosIdentityId,
    isInstanceAdmin,
    actorId: actorUserModel.entityUuid,
  });

  return await userModel.getRootedSubgraph(graphApi, {
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  });
};
