import { Subgraph } from "@hashintel/hash-subgraph";
import { createKratosIdentity } from "../../../../auth/ory-kratos";
import { getLatestEntityRootedSubgraph } from "../../../../graph/knowledge/primitive/entity";
import { createUser } from "../../../../graph/knowledge/system-types/user";
import { MutationCreateUserArgs, ResolverFn } from "../../../api-types.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const createUserResolver: ResolverFn<
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
    hasLeftEntity,
  },
  { dataSources: { graphApi }, user: actorUser },
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

  const user = await createUser(
    { graphApi },
    {
      emails: [emailAddress],
      shortname: shortname ?? undefined,
      preferredName: preferredName ?? undefined,
      kratosIdentityId,
      isInstanceAdmin,
      actorId: actorUser.accountId,
    },
  );

  return await getLatestEntityRootedSubgraph(
    { graphApi },
    { entity: user.entity, graphResolveDepths: { hasLeftEntity } },
  );
};
