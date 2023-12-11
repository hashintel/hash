import {
  createEntity,
  CreateEntityParams,
} from "@apps/hash-api/src/graph/knowledge/primitive/entity";
import { GraphApi } from "@local/hash-graph-client";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import { AccountId, EntityId, Timestamp } from "@local/hash-subgraph";

export const createGraphChangeNotification = async (
  context: { graphApi: GraphApi },
  authentication: { machineActorId: AccountId },
  params: {
    entityId: EntityId;
    editionId: Timestamp;
    operation: "create" | "update";
    notifiedUserAccountId: AccountId;
  },
): Promise<GraphChangeNotification> => {
  const { graphApi } = context;

  const {
    entityId,
    editionId,
    operation,
    notifiedUserAccountId,
  } = params;

  const entity = await createEntity(context, authentication, {
    ownedById,
    properties: {},
    entityTypeId: systemEntityTypes.mentionNotification.entityTypeId,
    relationships: [],
    inheritedPermissions: [
      "administratorFromWeb",
      "updateFromWeb",
      "viewFromWeb",
    ],
  });

  await createLinkEntity(context, authentication, {
        ownedById,
        leftEntityId: entity.metadata.recordId.entityId,
        rightEntityId: triggeredByUser.entity.metadata.recordId.entityId,
        linkEntityTypeId:
          systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
        relationships: [],
        inheritedPermissions: [
          "administratorFromWeb",
          "updateFromWeb",
          "viewFromWeb",
        ],
      }),

};
