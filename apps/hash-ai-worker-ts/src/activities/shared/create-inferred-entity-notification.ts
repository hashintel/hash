import {
  type ActorId,
  extractDraftIdFromEntityId,
} from "@blockprotocol/type-system";
import { createGraphChangeNotification } from "@local/hash-backend-utils/notifications";
import type { GraphApi } from "@local/hash-graph-client";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

export const createInferredEntityNotification = async ({
  graphApiClient,
  entity,
  operation,
  notifiedUserAccountId,
}: {
  entity: HashEntity;
  graphApiClient: GraphApi;
  operation: "create" | "update";
  notifiedUserAccountId: ActorId;
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
