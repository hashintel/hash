import { getWebMachineActorId } from "@local/hash-backend-utils/machine-actors";
import type { GraphApi } from "@local/hash-graph-client";
import { Entity } from "@local/hash-graph-sdk/entity";
import type { AccountId } from "@local/hash-graph-types/account";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { Timestamp } from "@local/hash-graph-types/temporal-versioning";
import type { OwnedById } from "@local/hash-graph-types/web";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { EntityRelationAndSubject } from "@local/hash-subgraph";

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
  const notificationEntity = await Entity.create(
    graphApi,
    { actorId: webMachineActorId },
    {
      draft: false,
      entityTypeId: systemEntityTypes.graphChangeNotification.entityTypeId,
      ownedById: notifiedUserAccountId as OwnedById,
      properties: {
        [systemPropertyTypes.graphChangeType.propertyTypeBaseUrl]: operation,
      },
      relationships: notificationEntityRelationships,
    },
  );

  await Entity.create(
    graphApi,
    /**
     * We use the user's authority to create the link to the entity because it might be in a different web, e.g. an org's,
     * and we can't be sure that any single bot has access to both the user's web and the web of the changed entity,
     * which might have been created by e.g. an AI bot that has access to the entity's web but not the user's.
     *
     * Ideally we would have a global bot with restricted permissions across all webs to do this – H-1605
     */
    { actorId: notifiedUserAccountId },
    {
      draft: false,
      entityTypeId: systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
      ownedById: notifiedUserAccountId as OwnedById,
      linkData: {
        leftEntityId: notificationEntity.metadata.recordId.entityId,
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
