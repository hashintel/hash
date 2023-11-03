import { UpdateLinearIssueWorkflow } from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  Entity,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractOwnedByIdFromEntityId,
  OwnedById,
  Uuid,
} from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";

import { getLinearSecretValueByHashWorkspaceId } from "../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../graph/system-account";
import { createTemporalClient } from "../../temporal";
import { genId } from "../../util";
import { createVaultClient } from "../../vault";

export const supportedTypeIds = Object.values(linearTypes.entityType).map(
  (entityType) => entityType.entityTypeId,
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

  // @todo: Figure out who the actor should be
  //    see https://linear.app/hash/issue/H-756
  const authentication = {
    actorId: entity.metadata.provenance.recordCreatedById,
  };

  const linearApiKey = await getLinearSecretValueByHashWorkspaceId(
    { graphApi },
    authentication,
    {
      hashWorkspaceEntityId: entityIdFromOwnedByIdAndEntityUuid(
        systemAccountId as OwnedById,
        owningAccountUuId as Uuid as EntityUuid,
      ),
      vaultClient,
    },
  );

  const resourceId =
    entity.properties[
      extractBaseUrl(linearTypes.propertyType.id.propertyTypeId)
    ];

  switch (entityTypeId) {
    case linearTypes.entityType.issue.entityTypeId: {
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
