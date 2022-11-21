import { OrgModel } from "../../../../model";
import {
  MutationCreateOrgArgs,
  ResolverFn,
  Subgraph,
} from "../../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../../context";
import { mapSubgraphToGql } from "../../ontology/model-mapping";

export const createOrg: ResolverFn<
  Promise<Subgraph>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgArgs
> = async (
  _,
  { name, shortname, orgSize, linkResolveDepth, linkTargetEntityResolveDepth },
  { dataSources: { graphApi }, userModel },
) => {
  const orgModel = await OrgModel.createOrg(graphApi, {
    shortname,
    name,
    providedInfo: { orgSize },
    actorId: userModel.entityUuid,
  });

  const orgRootedSubgraph = await orgModel.getRootedSubgraph(graphApi, {
    linkResolveDepth,
    linkTargetEntityResolveDepth,
  });

  return mapSubgraphToGql(orgRootedSubgraph);
};
