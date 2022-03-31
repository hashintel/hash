import {
  MutationConfigureOrgIntegrationArgs,
  OrgIntegration,
  Resolver,
} from "../../apiTypes.gen";
import { LoggedInGraphQLContext } from "../../context";
import { createIntegrationManagerForApollo } from "./createIntegrationManagerForApollo";
import { integrationInfoToGQLOrgIntegration } from "./integrationInfoToGQLOrgIntegration";

export const configureOrgIntegration: Resolver<
  Promise<OrgIntegration>,
  {},
  LoggedInGraphQLContext,
  MutationConfigureOrgIntegrationArgs
> = async (
  _parent,
  { fields, integrationId, organizationEntityId },
  { dataSources, user, logger },
) => {
  const integrationManager = await createIntegrationManagerForApollo(
    logger,
    dataSources,
    {
      organizationEntityId,
    },
  );

  const integration = await integrationManager.expectIntegrationInfo(
    integrationId,
  );

  // TODO: ensure the user has access to this integrationId (ensure it's a part of an org we're admin of?)
  logger.info("configureOrgIntegration", { fields, integrationId, user });
  await integrationManager.integration(integration).configureFields(
    fields.map((f) => ({
      fieldKey: f.fieldKey,
      value: f.value ?? undefined,
    })),
  );

  const updatedInfo = await integrationManager.expectIntegrationInfo(
    integrationId,
  );

  return integrationInfoToGQLOrgIntegration(updatedInfo);
};
