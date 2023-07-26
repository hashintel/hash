import { GraphApi } from "@local/hash-graph-client";
import { linearTypes } from "@local/hash-isomorphic-utils/ontology-types";
import { Entity, extractOwnedByIdFromEntityId } from "@local/hash-subgraph";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import { v4 as uuid } from "uuid";

import { getLinearUserSecretByLinearOrgId } from "../../graph/knowledge/system-types/linear-user-secret";
import { createTemporalClient } from "../../temporal";
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

  const owningAccountId = extractOwnedByIdFromEntityId(
    entity.metadata.recordId.entityId,
  );

  const linearOrgId = "123"; // @todo

  const linearApiKey = await getLinearUserSecretByLinearOrgId(
    { graphApi, uploadProvider: null as any }, // @todo uploadProvider shouldn't be required
    {
      linearOrgId,
      userAccountId: owningAccountId, // @todo this function will be changed in a PR soon
    },
  );

  const resourceId =
    entity.properties[
      extractBaseUrl(linearTypes.propertyType.id.propertyTypeId)
    ];

  switch (entityTypeId) {
    case linearTypes.entityType.issue.entityTypeId: {
      // eslint-disable-next-line no-console
      console.log("Change to Linear Issue detected");

      const result = await temporalClient.workflow.start("updateLinearIssue", {
        workflowId: uuid(),
        taskQueue: "integration",
        args: [linearApiKey, resourceId, entity.properties],
      });

      console.log({ result });
    }
  }
};
