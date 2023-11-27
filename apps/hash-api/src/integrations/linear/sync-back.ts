import { VersionedUrl } from "@blockprotocol/type-system";
import { UpdateLinearIssueWorkflow } from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import {
  linearEntityTypes,
  linearPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  Entity,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractOwnedByIdFromEntityId,
  Uuid,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getLinearSecretValueByHashWorkspaceId } from "../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../graph/system-account";
import { createTemporalClient } from "../../temporal";
import { genId } from "../../util";
import { createVaultClient } from "../../vault";

export const supportedTypeIds = Object.values(linearEntityTypes).map(
  ({ entityTypeId }) => entityTypeId as VersionedUrl,
);

export const processEntityChange = async (
  entity: Entity,
  graphApi: GraphApi,
) => {
  const { entityTypeId } = entity.metadata;

  if (!supportedTypeIds.includes(entityTypeId)) {
    throw new Error(
      `Entity with entity type ${entityTypeId} passed to Linear sync back processor – supported types are ${supportedTypeIds.join(
        ", ",
      )}.`,
    );
  }

  const temporalClient = await createTemporalClient();
  if (!temporalClient) {
    throw new Error(
      "Cannot create Temporal client – are there missing environment variables?",
    );
  }

  const vaultClient = createVaultClient();
  if (!vaultClient) {
    throw new Error(
      "Cannot create Vault client – are there missing environment variables?",
    );
  }

  const owningAccountUuId = extractOwnedByIdFromEntityId(
    entity.metadata.recordId.entityId,
  );

  /**
   * This assumes the web of the entity is an org web, not a user web.
   *
   * @todo: fix this so that it works for users and orgs
   */
  const hashWorkspaceEntityId = entityIdFromOwnedByIdAndEntityUuid(
    owningAccountUuId,
    owningAccountUuId as Uuid as EntityUuid,
  );

  const linearApiKey = await getLinearSecretValueByHashWorkspaceId(
    { graphApi },
    /**
     * We currently assign the integration permissions to the system account ID,
     * in the `syncLinearIntegrationWithWorkspaces` resolver, so we user the
     * `systemAccountId` here for now.
     */
    { actorId: systemAccountId },
    {
      hashWorkspaceEntityId,
      vaultClient,
    },
  );

  const resourceId =
    entity.properties[extractBaseUrl(linearPropertyTypes.id.propertyTypeId)];

  switch (entityTypeId) {
    case linearEntityTypes.issue.entityTypeId: {
      await temporalClient.workflow.start<UpdateLinearIssueWorkflow>(
        "updateLinearIssue",
        {
          workflowId: genId(),
          taskQueue: "integration",
          args: [
            {
              apiKey: linearApiKey,
              issueId: resourceId as string,
              payload: entity.properties,
            },
          ],
        },
      );
    }
  }
};
