// import { Org } from "../../../model";
import {
  MutationPerformOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { createIntegrationManagerForApollo } from "./createIntegrationManagerForApollo";
import { integrationInfoToGQLOrgIntegration } from "./integrationInfoToGQLOrgIntegration";

export const performOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationPerformOrgIntegrationArgs
> = async (
  _parent,
  { organizationEntityId, integrationId },
  { dataSources, user, logger },
) => {
  const integrationManager = await createIntegrationManagerForApollo(
    logger,
    dataSources,
    { organizationEntityId },
  );

  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("performOrgIntegration", {
    organizationEntityId,
    integrationId,
    user: user.entityId,
  });

  const integration = await integrationManager.expectIntegrationInfo(
    integrationId,
  );

  await integrationManager.integration(integration).performIntegration();

  // get updated
  const updatedInfo = await integrationManager.expectIntegrationInfo(
    integrationId,
  );

  return integrationInfoToGQLOrgIntegration(updatedInfo);
};
