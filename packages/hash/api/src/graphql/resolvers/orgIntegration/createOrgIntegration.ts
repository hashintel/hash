import { ApolloError } from "apollo-server-express";
import { createIntegrationWorkflowManager } from "../../../temporal/integration-workflows/createIntegrationWorkflowManager";
import { getIntegrationInfo } from "../../../temporal/integration-workflows/getIntegrationInfo";

// import { Org } from "../../../model";
import {
  MutationCreateOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { expectOrgForApollo } from "../org/expectOrgForApollo";
import { integrationInfoToGQLOrgIntegration } from "./integrationInfoToGQLOrgIntegration";

export const createOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgIntegrationArgs
> = async (_parent, { input }, { dataSources, user, logger }) => {
  const org = await expectOrgForApollo(dataSources.db, {
    entityId: input.organizationAccountId,
  });

  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("createOrgIntegration", { input });

  const orgClient = dataSources.wf.createOrganizationWorkflowClient({
    organizationAccountId: org.accountId,
  });

  const integrationManager = createIntegrationWorkflowManager(
    logger,
    orgClient,
  );

  const newIntegration = await integrationManager.addNewIntegrationWorkflow(
    input.integrationName,
  );

  const integrationInfo = await getIntegrationInfo(newIntegration.handle, {
    timeout: 5000,
  });

  if (integrationInfo == null) {
    throw new ApolloError(
      "Integration info was not found. It's possible that the workflow took too long to start up.",
    );
  }

  return integrationInfoToGQLOrgIntegration(integrationInfo);
};
