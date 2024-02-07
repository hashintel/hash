import { VersionedUrl } from "@blockprotocol/type-system";
import { linearTypeMappings } from "@local/hash-backend-utils/linear-type-mappings";
import { getMachineActorId } from "@local/hash-backend-utils/machine-actors";
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

import { ImpureGraphContext } from "../../graph/context-types";
import { getLatestEntityById } from "../../graph/knowledge/primitive/entity";
import { getLinearSecretValueByHashWorkspaceId } from "../../graph/knowledge/system-types/linear-user-secret";
import { systemAccountId } from "../../graph/system-account";
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
    temporalClient: null,
  };

  const linearEntityToUpdate = supportedLinearEntityTypeIds.includes(
    entityTypeId,
  )
    ? entity
    : await getLatestEntityById(
        graphContext,
        { actorId: linearMachineActorId },
        { entityId: (entity as LinkEntity).linkData.leftEntityId },
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
  const hashWorkspaceEntityId = entityIdFromOwnedByIdAndEntityUuid(
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
          authentication: { actorId: linearMachineActorId },
          entityTypeId: linearEntityToUpdate.metadata.entityTypeId,
          entity: linearEntityToUpdate,
        },
      ],
    },
  );
};
