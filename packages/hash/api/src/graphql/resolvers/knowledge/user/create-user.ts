import { createKratosIdentity } from "../../../../auth/ory-kratos";
import { UserModel } from "../../../../model";
import {
  MutationCreateUserArgs,
  ResolverFn,
  Subgraph,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapSubgraphToGql } from "../../ontology/model-mapping";

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
    actorId: actoruserModel.entityUuid,
  });

  const userRootedSubgraph = await userModel.getRootedSubgraph(graphApi, {
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  });

  return mapSubgraphToGql(userRootedSubgraph);
};
