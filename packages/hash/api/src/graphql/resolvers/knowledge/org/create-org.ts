import { Subgraph } from "@hashintel/hash-subgraph";
import { OrgModel } from "../../../../model";
import { MutationCreateOrgArgs, ResolverFn } from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";

export const createOrg: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, orgSize, hasLeftEntity },
  { dataSources: { graphApi }, userModel },
) => {
  const orgModel = await OrgModel.createOrg(graphApi, {
    shortname,
    name,
    providedInfo: { orgSize },
    actorId: userModel.getEntityUuid(),
  });

  return await orgModel.getRootedSubgraph(graphApi, {
    hasLeftEntity,
  });
};
