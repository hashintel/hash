import {
  Resolver,
  Org as GQLOrg,
  OrgIntegration,
  OrgIntegrationConfigurationField,
} from "../../apiTypes.gen";
import { GraphQLContext } from "../../context";
import { UnresolvedGQLEntity } from "../../../model/entity.model";
import { manageIntegration } from "../../../temporal/integration-workflows/workflows";
import { expectOrgForApollo } from "./expectOrgForApollo";
import { IntegrationInfo } from "../../../temporal/integration-workflows/getIntegrationInfo";
import { integrationInfoToGQLOrgIntegration } from "../orgIntegration/integrationInfoToGQLOrgIntegration";

const invitationLinks: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await expectOrgForApollo(dataSources.db, { entityId });
  const invitations = await org.getInvitationLinks(dataSources.db);

  return invitations.map((invitation) => invitation.toGQLUnknownEntity());
};

const memberships: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await expectOrgForApollo(dataSources.db, { entityId });

  const orgMemberships = await org.getOrgMemberships(dataSources.db);

  return orgMemberships.map((orgMembership) =>
    orgMembership.toGQLUnknownEntity(),
  );
};

const emailInvitations: Resolver<
  Promise<UnresolvedGQLEntity[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _, { dataSources }) => {
  const org = await expectOrgForApollo(dataSources.db, { entityId });

  const invitations = await org.getEmailInvitations(dataSources.db);

  return invitations.map((invitation) => invitation.toGQLUnknownEntity());
};

const integrations: Resolver<
  Promise<OrgIntegration[]>,
  GQLOrg,
  GraphQLContext
> = async ({ entityId }, _args, { dataSources, logger }) => {
  const org = await expectOrgForApollo(dataSources.db, { entityId });
  // todo: large portions of this should be moved to within some integrations client
  const wfOrgClient = dataSources.wf.createOrganizationWorkflowClient({
    organizationAccountId: org.accountId,
  });
  const workflows =
    await wfOrgClient.workflowClient.service.listOpenWorkflowExecutions({
      namespace: wfOrgClient.namespace,
    });

  const integrations: IntegrationInfo[] = (
    await Promise.all(
      workflows.executions.map(
        async (exec): Promise<IntegrationInfo | null> => {
          const workflowId = exec.execution?.workflowId;
          const runId = exec.execution?.runId;
          if (
            exec.type?.name === manageIntegration.name &&
            workflowId &&
            runId
          ) {
            const handle = wfOrgClient.workflowClient.getHandle(
              workflowId,
              runId,
            );
          }

          return null;
        },
      ),
    )
  ).filter(
    // ugh... TypeScript, please get better at inferring for filter please!
    (infoOrNull): infoOrNull is IntegrationInfo => infoOrNull != null,
  );

  return integrations.map(integrationInfoToGQLOrgIntegration);
};

export const orgLinkedEntities = {
  integrations,
  invitationLinks,
  memberships,
  emailInvitations,
};
