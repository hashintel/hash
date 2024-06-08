import { createGraphChangeNotification } from "@local/hash-backend-utils/notifications";
import type { GraphApi } from "@local/hash-graph-client";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import { extractDraftIdFromEntityId } from "@local/hash-subgraph";

export const createInferredEntityNotification = async ({
  graphApiClient,
  entity,
  operation,
  notifiedUserAccountId,
}: {
  entity: Entity;
  graphApiClient: GraphApi;
  operation: "create" | "update";
  notifiedUserAccountId: AccountId;
}) => {
  const entityIsDraft = !!extractDraftIdFromEntityId(
    entity.metadata.recordId.entityId,
  );

  if (entityIsDraft) {
    /**
     * We don't create notifications for draft entities, the user has them in an actions queue for processing anyway.
     */
    return;
  }

  const entityEditionTimestamp =
    entity.metadata.temporalVersioning.decisionTime.start.limit;

  await createGraphChangeNotification(
    { graphApi: graphApiClient },
    {
      changedEntityId: entity.metadata.recordId.entityId,
      changedEntityEditionId: entityEditionTimestamp,
      notifiedUserAccountId,
      operation,
    },
  );
};
