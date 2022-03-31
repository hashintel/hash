import {
  MutationEnableOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { createIntegrationManagerForApollo } from "./createIntegrationManagerForApollo";
import { integrationInfoToGQLOrgIntegration } from "./integrationInfoToGQLOrgIntegration";

export const enableOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationEnableOrgIntegrationArgs
> = async (
  _parent,
  { integrationId, enable, organizationEntityId },
  { dataSources, user, logger },
) => {
  const integrationManager = await createIntegrationManagerForApollo(
    logger,
    dataSources,
    { organizationEntityId },
  );

  const info = await integrationManager.expectIntegrationInfo(integrationId);

  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("enableOrgIntegration", { integrationId, enable, user });
  await integrationManager.integration(info).setEnabled(enable);

  const updatedInfo = await integrationManager.expectIntegrationInfo(
    integrationId,
  );

  return integrationInfoToGQLOrgIntegration(updatedInfo);
};
