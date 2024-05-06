import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  AccountId,
  EntityId,
  EntityRelationAndSubject,
  OwnedById,
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

  const userAuthentication = { actorId: notifiedUserAccountId };

  const webMachineActorId = await getWebMachineActorId(
    context,
    userAuthentication,
    { ownedById: notifiedUserAccountId as OwnedById },
  );

  const { linkEntityRelationships, notificationEntityRelationships } =
    createNotificationEntityPermissions({
      machineActorId: webMachineActorId,
    });

  /**
   * We create the notification entity with the user's web bot, as we know it has the necessary permissions in the user's web
   */
  const notificationEntityMetadata = await graphApi
    .createEntity(webMachineActorId, {
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
     * and we can't be sure that any single bot has access to both the user's web and the web of the changed entity,
     * which might have been created by e.g. an AI bot that has access to the entity's web but not the user's.
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
