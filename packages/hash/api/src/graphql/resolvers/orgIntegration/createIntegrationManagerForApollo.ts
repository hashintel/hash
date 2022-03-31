import { Logger } from "@hashintel/hash-backend-utils/logger";
import { DbClient } from "../../../db";
import { TemporalWorkflowPool } from "../../../temporal/createTemporalWorkflowPool";
import { createOrgIntegrationsManager } from "../../../temporal/integration-workflows/createOrgIntegrationsManager";
import { expectOrgForApollo } from "../org/expectOrgForApollo";

/**
 * Helper which should validate inputs & throw relevant errors for apollo api layer.
 * e.g. `ApolloError` when  org is not found.
 */
export async function createIntegrationManagerForApollo(
  logger: Logger,
  dataSources: {
    db: DbClient; // AKA DbAdaptor
    wf: TemporalWorkflowPool;
  },
  options: {
    organizationEntityId: string;
  },
) {
  const org = await expectOrgForApollo(dataSources.db, {
    entityId: options.organizationEntityId,
  });

  const orgClient = dataSources.wf.createOrganizationWorkflowClient({
    organizationEntityId: org.entityId,
  });

  const integrationManager = createOrgIntegrationsManager(logger, orgClient);
  return integrationManager;
}
