import { VersionedUrl } from "@blockprotocol/type-system";
import { linearTypeMappings } from "@local/hash-backend-utils/linear-type-mappings";
import { UpdateLinearDataWorkflow } from "@local/hash-backend-utils/temporal-workflow-types";
import { GraphApi } from "@local/hash-graph-client";
import { linearPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  Entity,
  entityIdFromOwnedByIdAndEntityUuid,
  EntityUuid,
  extractOwnedByIdFromEntityId,
  Uuid,
} from "@local/hash-subgraph";
import {
  extractBaseUrl,
  LinkEntity,
} from "@local/hash-subgraph/type-system-patch";

import { systemAccountId } from "../../graph/ensure-hash-system-account-exists";
import { getLatestEntityById } from "../../graph/knowledge/primitive/entity";
import { getLinearSecretValueByHashWorkspaceId } from "../../graph/knowledge/system-types/linear-user-secret";
import { createTemporalClient } from "../../temporal";
import { genId } from "../../util";
import { createVaultClient } from "../../vault";

const supportedLinearEntityTypeIds = linearTypeMappings.map(
  ({ hashEntityTypeId }) => hashEntityTypeId as VersionedUrl,
);

const supportedLinearLinkEntityTypeIds = linearTypeMappings
  .map(({ outgoingLinkMappings }) =>
    outgoingLinkMappings.map(
      ({ linkEntityTypeId }) => linkEntityTypeId as VersionedUrl,
    ),
  )
  .flat();

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

  if (entity.metadata.provenance.recordCreatedById === systemAccountId) {
    /**
     * To prevent update loops where changes from linear are saved in HASH, and
     * then propagate back to linear, only consider entity editions that weren't
     * created by the system account ID (currently the actor for all updates in
     * the linear integration).
     */
    return;
  }

  const linearEntityToUpdate = supportedLinearEntityTypeIds.includes(
    entityTypeId,
  )
    ? entity
    : await getLatestEntityById(
        { graphApi },
        { actorId: systemAccountId },
        { entityId: (entity as LinkEntity).linkData.leftEntityId },
      );

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
    linearEntityToUpdate.metadata.recordId.entityId,
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

  const linearId =
    linearEntityToUpdate.properties[
      extractBaseUrl(linearPropertyTypes.id.propertyTypeId)
    ];

  if (!linearId) {
    return;
  }

  await temporalClient.workflow.start<UpdateLinearDataWorkflow>(
    "updateLinearData",
    {
      workflowId: genId(),
      taskQueue: "integration",
      args: [
        {
          apiKey: linearApiKey,
          linearId: linearId as string,
          authentication: { actorId: systemAccountId },
          entityTypeId: linearEntityToUpdate.metadata.entityTypeId,
          entity: linearEntityToUpdate,
        },
      ],
    },
  );
};
