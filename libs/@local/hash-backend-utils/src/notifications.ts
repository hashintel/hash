import { GraphApi } from "@local/hash-graph-client";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  AccountId,
  EntityId,
  EntityRelationAndSubject,
  Timestamp,
} from "@local/hash-subgraph";

export const createNotificationEntityPermissions = ({
  machineActorId,
}: {
  machineActorId: AccountId;
}): {
  linkEntityRelationships: EntityRelationAndSubject[];
  notificationEntityRelationships: EntityRelationAndSubject[];
} => ({
  linkEntityRelationships: [
    {
      relation: "administrator",
      subject: {
        kind: "account",
        subjectId: machineActorId,
      },
    },
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "viewFromWeb",
      },
    },
  ],
  notificationEntityRelationships: [
    {
      relation: "administrator",
      subject: {
        kind: "account",
        subjectId: machineActorId,
      },
    },
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "updateFromWeb",
      },
    },
    {
      relation: "setting",
      subject: {
        kind: "setting",
        subjectId: "viewFromWeb",
      },
    },
  ],
});

export const createGraphChangeNotification = async (
  context: { graphApi: GraphApi },
  { machineActorId }: { machineActorId: AccountId },
  params: {
    changedEntityId: EntityId;
    changedEntityEditionId: Timestamp;
    operation: "create" | "update";
    notifiedUserAccountId: AccountId;
  },
) => {
  const { graphApi } = context;

  const {
    changedEntityId,
    changedEntityEditionId,
    operation,
    notifiedUserAccountId,
  } = params;

  const { linkEntityRelationships, notificationEntityRelationships } =
    createNotificationEntityPermissions({
      machineActorId,
    });

  const notificationEntityMetadata = await graphApi
    .createEntity(machineActorId, {
      draft: false,
      entityTypeId: systemEntityTypes.graphChangeNotification.entityTypeId,
      ownedById: notifiedUserAccountId,
      properties: {
        [systemPropertyTypes.graphChangeType.propertyTypeBaseUrl]: operation,
      },
      relationships: notificationEntityRelationships,
    })
    .then((resp) => resp.data);

  await graphApi.createEntity(machineActorId, {
    draft: false,
    entityTypeId: systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
    ownedById: notifiedUserAccountId,
    linkData: {
      leftEntityId: notificationEntityMetadata.recordId.entityId,
      rightEntityId: changedEntityId,
    },
    properties: {
      [systemPropertyTypes.entityEditionId.propertyTypeBaseUrl]:
        changedEntityEditionId,
    },
    relationships: linkEntityRelationships,
  });
};
