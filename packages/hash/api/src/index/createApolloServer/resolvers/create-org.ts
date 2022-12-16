import { Subgraph } from "@hashintel/hash-subgraph";
import { OrgModel } from "../../auth/model";
import {
  MutationCreateOrgArgs,
  ResolverFn,
} from "../../auth/model/aggregation.model/apiTypes.gen";
import { LoggedInGraphQLContext } from "./embed/context";

export const createOrg: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, orgSize, hasLeftEntity, hasRightEntity },
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
    hasRightEntity,
  });
};
