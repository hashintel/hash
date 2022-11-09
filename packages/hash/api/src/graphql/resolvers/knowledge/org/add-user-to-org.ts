import { OrgModel, UserModel } from "../../../../model";
import {
  MutationAddUserToOrgArgs,
  ResolverFn,
  Subgraph,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapSubgraphToGql } from "../../ontology/model-mapping";

export const addUserToOrg: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationAddUserToOrgArgs
> = async (
  _,
  {
    orgEntityId,
    userEntityId,
    responsibility,
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  },
  { dataSources: { graphApi }, userModel: actorUserModel },
) => {
  const [orgModel, userModel] = await Promise.all([
    OrgModel.getOrgById(graphApi, {
      entityId: orgEntityId,
    }),
    UserModel.getUserById(graphApi, { entityId: userEntityId }),
  ]);

  await userModel.joinOrg(graphApi, {
    org: orgModel,
    responsibility,
    actorId: actorUserModel.entityId,
  });

  const orgRootedSubgraph = await orgModel.getRootedSubgraph(graphApi, {
    linkResolveDepth: linkResolveDepth ?? 0,
    linkTargetEntityResolveDepth: linkTargetEntityResolveDepth ?? 0,
  });

  return mapSubgraphToGql(orgRootedSubgraph);
};
