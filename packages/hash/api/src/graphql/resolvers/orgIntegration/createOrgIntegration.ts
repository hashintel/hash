// import { Org } from "../../../model";
import {
  MutationCreateOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { createIntegrationManagerForApollo } from "./createIntegrationManagerForApollo";
import { integrationInfoToGQLOrgIntegration } from "./integrationInfoToGQLOrgIntegration";

export const createOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationCreateOrgIntegrationArgs
> = async (_parent, { input }, { dataSources, user, logger }) => {
  const integrationManager = await createIntegrationManagerForApollo(
    logger,
    dataSources,
    input,
  );

  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("createOrgIntegration", { input });

  const newIntegration = await integrationManager
    .addNewIntegrationWorkflow(input.integrationName)
    .catch((err) => {
      err.message = `Integration info was not found after creation. It's possible that the workflow took too long to start up or there were no worker processes started.\n${err.message}`;
      return Promise.reject(err);
    });

  return integrationInfoToGQLOrgIntegration(newIntegration.info);
};
