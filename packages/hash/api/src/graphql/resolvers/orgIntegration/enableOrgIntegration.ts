import { ApolloError } from "apollo-server-express";

// import { Org } from "../../../model";
import {
  MutationEnableOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

export const enableOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationEnableOrgIntegrationArgs
> = async (
  _parent,
  { integrationId, enable, organizationAccountId },
  { dataSources, user, logger },
) => {
  const client = dataSources.wf.createOrganizationWorkflowClient({
    organizationAccountId,
  });

  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("enableOrgIntegration", { integrationId, enable });
  throw new ApolloError("Incomplete implementation", "NOT_IMPLEMENTED");
};
