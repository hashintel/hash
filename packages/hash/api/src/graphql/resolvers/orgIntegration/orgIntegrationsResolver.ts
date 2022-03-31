import { Resolver, Org as GQLOrg, OrgIntegration } from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { integrationInfoToGQLOrgIntegration } from "./integrationInfoToGQLOrgIntegration";
import { createIntegrationManagerForApollo } from "./createIntegrationManagerForApollo";

export const orgIntegrationsResolver: Resolver<
  Promise<OrgIntegration[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _args, { dataSources, logger }) => {
  const integrationManager = await createIntegrationManagerForApollo(
    logger,
    dataSources,
    { organizationEntityId: entityId },
  );

  const integrations = await integrationManager.listIntegrationWorkflows();

  return integrations.map(integrationInfoToGQLOrgIntegration);
};
