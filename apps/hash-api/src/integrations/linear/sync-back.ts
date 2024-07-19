import type { VersionedUrl } from "@blockprotocol/type-system";
import { linearTypeMappings } from "@local/hash-backend-utils/linear-type-mappings";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
import { createTemporalClient } from "@local/hash-backend-utils/temporal";
import type { UpdateLinearDataWorkflow } from "@local/hash-backend-utils/temporal-integration-workflow-types";
import { createVaultClient } from "@local/hash-backend-utils/vault";
import type { GraphApi } from "@local/hash-graph-client";
import type { Entity , LinkEntity } from "@local/hash-graph-sdk/entity";
import type { Uuid } from "@local/hash-graph-types/branded";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { generateUuid } from "@local/hash-isomorphic-utils/generate-uuid";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  entityIdFromComponents,
  extractOwnedByIdFromEntityId,
} from "@local/hash-subgraph";

import type { ImpureGraphContext } from "../../graph/context-types";
import { getLatestEntityById } from "../../graph/knowledge/primitive/entity";
import { getLinearSecretValueByHashWorkspaceId } from "../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../graph/system-account";

const supportedLinearEntityTypeIds = linearTypeMappings.map(
  ({ hashEntityTypeId }) => hashEntityTypeId as VersionedUrl,
);

const supportedLinearLinkEntityTypeIds = linearTypeMappings
  .flatMap(({ outgoingLinkMappings }) =>
    outgoingLinkMappings.map(
      ({ linkEntityTypeId }) => linkEntityTypeId as VersionedUrl,
    ),
  );

export const supportedLinearTypeIds = [
  ...supportedLinearEntityTypeIds,
  ...supportedLinearLinkEntityTypeIds,
];

export const processEntityChange = async (
  entity: Entity,
  graphApi: GraphApi,
) => {
  const { entityTypeId } = entity.metadata;

  if (!supportedLinearTypeIds.includes(entityTypeId)) {
    throw new Error(
      `Entity with entity type ${entityTypeId} passed to Linear sync back processor – supported types are ${supportedLinearEntityTypeIds.join(
        ", ",
      )}.`,
    );
  }

  const linearMachineActorId = await getMachineActorId(
    { graphApi },
    { actorId: systemAccountId },
    { identifier: "linear" },
  );

  if (entity.metadata.provenance.edition.createdById === linearMachineActorId) {
    /**
     * To prevent update loops where changes from linear are saved in HASH, and
     * then propagate back to linear, only consider entity editions that weren't
     * created by the Linear machine account's actorId.
     */
    return;
  }

  const graphContext: ImpureGraphContext = {
    graphApi,
    provenance: {
      actorType: "machine",
      origin: {
        /**
         * @todo Use correct EntityId for Flow when Linear integration migrated to Flows.
         */
        id: "linear-integration",
        type: "flow",
      },
    },
    temporalClient: null,
  };

  const linearEntityToUpdate = supportedLinearEntityTypeIds.includes(
    entityTypeId,
  )
    ? entity
    : await getLatestEntityById(
        graphContext,
        { actorId: linearMachineActorId },
        { entityId: new LinkEntity(entity).linkData.leftEntityId },
      );

  const temporalClient = await createTemporalClient();

  const vaultClient = createVaultClient();

  if (!vaultClient) {
    throw new Error(
      "Cannot create Vault client – are there missing environment variables?",
    );
  }

  const owningAccountUuId = extractOwnedByIdFromEntityId(
    linearEntityToUpdate.metadata.recordId.entityId,
  );

  /**
   * This assumes the web of the entity is an org web, not a user web.
   *
   * @todo: fix this so that it works for users and orgs
   */
  const hashWorkspaceEntityId = entityIdFromComponents(
    owningAccountUuId,
    owningAccountUuId as Uuid as EntityUuid,
  );

  const linearApiKey = await getLinearSecretValueByHashWorkspaceId(
    graphContext,
    { actorId: linearMachineActorId },
    {
      hashWorkspaceEntityId,
      vaultClient,
    },
  );

  const linearId =
    linearEntityToUpdate.properties[linearPropertyTypes.id.propertyTypeBaseUrl];

  if (!linearId) {
    return;
  }

  await temporalClient.workflow.start<UpdateLinearDataWorkflow>(
    "updateLinearData",
    {
      workflowId: generateUuid(),
      taskQueue: "integration",
      args: [
        {
          apiKey: linearApiKey,
          linearId: linearId as string,
          authentication: { actorId: linearMachineActorId },
          entityTypeId: linearEntityToUpdate.metadata.entityTypeId,
          entity: linearEntityToUpdate.toJSON(),
        },
      ],
    },
  );
};
