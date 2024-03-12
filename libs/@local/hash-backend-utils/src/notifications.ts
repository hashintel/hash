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
      entityTypeIds: [systemEntityTypes.graphChangeNotification.entityTypeId],
      ownedById: notifiedUserAccountId,
      properties: {
        [systemPropertyTypes.graphChangeType.propertyTypeBaseUrl]: operation,
      },
      relationships: notificationEntityRelationships,
    })
    .then((resp) => resp.data);

  await graphApi.createEntity(
    /**
     * We use the user's authority to create the link to the entity because it might be in a different web, e.g. an org's,
     * and the bots creating notifications are currently scoped to a single web (and can't read the other side of the link)
     *
     * Ideally we would have a global bot with restricted permissions across all webs to do this – H-1605
     */
    notifiedUserAccountId,
    {
      draft: false,
      entityTypeIds: [systemLinkEntityTypes.occurredInEntity.linkEntityTypeId],
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
    },
  );
};
