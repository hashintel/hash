import { ApolloError } from "apollo-server-express";

// import { Org } from "../../../model";
import {
  MutationConfigureOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";

export const configureOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationConfigureOrgIntegrationArgs
> = async (
  _parent,
  { fields, integrationId, organizationAccountId },
  { dataSources, user, logger },
) => {
  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("configureOrgIntegration", { fields, integrationId });

  const client = dataSources.wf.createOrganizationWorkflowClient({
    organizationAccountId,
  });

  const org = await expectOrgForApollo(dataSources.db, { entityId });
  // todo: large portions of this should be moved to within some integrations client
  const wfOrgClient = dataSources.wf.createOrganizationWorkflowClient({
    organizationAccountId: org.accountId,
  });
  const workflows =
    await wfOrgClient.workflowClient.service.listOpenWorkflowExecutions({
      namespace: wfOrgClient.namespace,
    });

  throw new ApolloError("Incomplete implementation", "NOT_IMPLEMENTED");
};
