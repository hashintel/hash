import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import {
  getFirstEntityRevision,
  TextProperties,
} from "@local/hash-isomorphic-utils/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemTypes } from "@local/hash-isomorphic-utils/ontology-types";
import {
  SimpleProperties,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import {
  BlockProperties,
  CommentNotificationProperties,
  CommentProperties,
  NotificationProperties,
  PageProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import { MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import { mapGqlSubgraphFieldsFragmentToSubgraph } from "@local/hash-isomorphic-utils/types";
import {
  Entity,
  EntityRootType,
  LinkEntityAndRightEntity,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import { extractBaseUrl } from "@local/hash-subgraph/type-system-patch";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
} from "react";

import { useBlockProtocolUpdateEntity } from "../components/hooks/block-protocol-functions/knowledge/use-block-protocol-update-entity";
import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import { constructMinimalUser, MinimalUser } from "../lib/user-and-org";
import { useAuthInfo } from "../pages/shared/auth-info-context";

export type PageMentionNotification = {
  kind: "page-mention";
  createdAt: Date;
  entity: Entity<MentionNotificationProperties>;
  occurredInEntity: Entity<PageProperties>;
  occurredInBlock: Entity<BlockProperties>;
  occurredInText: Entity<TextProperties>;
  triggeredByUser: MinimalUser;
} & SimpleProperties<MentionNotificationProperties>;

export type CommentMentionNotification = {
  kind: "comment-mention";
  occurredInComment: Entity<CommentProperties>;
} & Omit<PageMentionNotification, "kind">;

export type NewCommentNotification = {
  kind: "new-comment";
  createdAt: Date;
  entity: Entity<CommentNotificationProperties>;
  occurredInEntity: Entity<PageProperties>;
  occurredInBlock: Entity<BlockProperties>;
  triggeredByComment: Entity<CommentProperties>;
  triggeredByUser: MinimalUser;
} & SimpleProperties<CommentNotificationProperties>;

export type CommentReplyNotification = {
  kind: "comment-reply";
  repliedToComment: Entity<CommentProperties>;
} & Omit<NewCommentNotification, "kind">;

export type Notification =
  | PageMentionNotification
  | CommentMentionNotification
  | NewCommentNotification
  | CommentReplyNotification;

export type NotificationsContextValues = {
  notifications?: Notification[];
  loading: boolean;
  refetch: () => Promise<void>;
  markNotificationAsRead: (params: {
    notification: Notification;
  }) => Promise<void>;
};

export const NotificationsContext =
  createContext<null | NotificationsContextValues>(null);

export const useNotifications = () => {
  const notificationsContext = useContext(NotificationsContext);

  if (!notificationsContext) {
    throw new Error("Context missing");
  }

  return notificationsContext;
};

const isLinkAndRightEntityWithLinkType =
  (linkEntityTypeId: VersionedUrl) =>
  ({ linkEntity }: LinkEntityAndRightEntity) =>
    linkEntity[0] && linkEntity[0].metadata.entityTypeId === linkEntityTypeId;

const fetchNotificationPollInterval = 5_000;

export const NotificationsContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const getNotificationsQueryFilter = useMemo<
    StructuralQueryEntitiesQueryVariables["query"]["filter"]
  >(
    () => ({
      all: [
        {
          equal: [
            { path: ["ownedById"] },
            { parameter: authenticatedUser?.accountId },
          ],
        },
        generateVersionedUrlMatchingFilter(
          systemTypes.entityType.notification.entityTypeId,
          { ignoreParents: false },
        ),
        notArchivedFilter,
      ],
    }),
    [authenticatedUser],
  );

  const {
    data: notificationRevisionsData,
    loading: loadingNotificationRevisions,
    refetch: refetchNotificationRevisions,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    pollInterval: fetchNotificationPollInterval,
    variables: {
      includePermissions: false,
      query: {
        filter: getNotificationsQueryFilter,
        graphResolveDepths: zeroedGraphResolveDepths,
        /**
         * We need to obtain all revisions of the notifications
         * to determine when they were created.
         *
         * @todo update this when we can obtain the created at timestamp
         * from the latest revision of an entity
         * @see https://linear.app/hash/issue/H-1098/expose-created-at-createdat-without-needing-to-fetch-entire-entity
         */
        temporalAxes: {
          pinned: { axis: "transactionTime", timestamp: null },
          variable: {
            axis: "decisionTime",
            interval: { start: { kind: "unbounded" }, end: null },
          },
        },
      },
    },
    skip: !authenticatedUser,
    fetchPolicy: "cache-and-network",
  });

  const {
    data: notificationsWithOutgoingLinksData,
    loading: loadingNotificationsWithOutgoingLinks,
    refetch: refetchNotificationsWithOutgoingLinks,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    pollInterval: fetchNotificationPollInterval,
    variables: {
      includePermissions: false,
      query: {
        filter: getNotificationsQueryFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          isOfType: { outgoing: 1 },
          // Retrieve the outgoing linked entities of the notification entity at depth 1
          hasLeftEntity: { outgoing: 0, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
      },
    },
    skip: !authenticatedUser,
    fetchPolicy: "cache-and-network",
  });

  const notifications = useMemo<Notification[] | undefined>(() => {
    if (
      !notificationsWithOutgoingLinksData ||
      !notificationRevisionsData ||
      loadingNotificationRevisions ||
      loadingNotificationsWithOutgoingLinks
    ) {
      return undefined;
    }

    const revisionsSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        notificationRevisionsData.structuralQueryEntities.subgraph,
      );

    const outgoingLinksSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        notificationsWithOutgoingLinksData.structuralQueryEntities.subgraph,
      );

    return (
      getRoots(outgoingLinksSubgraph)
        .map((entity) => {
          const {
            metadata: {
              entityTypeId,
              recordId: { entityId },
            },
          } = entity;

          const firstRevision = getFirstEntityRevision(
            revisionsSubgraph,
            entity.metadata.recordId.entityId,
          );

          const createdAt = new Date(
            firstRevision.metadata.temporalVersioning.decisionTime.start.limit,
          );

          const { readAt } = simplifyProperties(
            entity.properties as NotificationProperties,
          );

          const outgoingLinks = getOutgoingLinkAndTargetEntities(
            outgoingLinksSubgraph,
            entityId,
          );

          if (
            entityTypeId ===
            systemTypes.entityType.mentionNotification.entityTypeId
          ) {
            const occurredInEntity = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.occurredInEntity.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            const occurredInBlock = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.occurredInBlock.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            const occurredInText = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.occurredInText.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            const triggeredByUserEntity = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.triggeredByUser.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            if (
              !occurredInEntity ||
              !occurredInBlock ||
              !occurredInText ||
              !triggeredByUserEntity
            ) {
              throw new Error(
                `Mention notification "${entityId}" is missing required links`,
              );
            }

            const triggeredByUser = constructMinimalUser({
              userEntity: triggeredByUserEntity as Entity<UserProperties>,
            });

            const occurredInComment = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.occurredInComment.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            if (occurredInComment) {
              return {
                kind: "comment-mention",
                readAt,
                createdAt,
                entity,
                occurredInEntity: occurredInEntity as Entity<PageProperties>,
                occurredInBlock: occurredInBlock as Entity<BlockProperties>,
                occurredInText: occurredInText as Entity<TextProperties>,
                triggeredByUser,
                occurredInComment:
                  occurredInComment as Entity<CommentProperties>,
              } satisfies CommentMentionNotification;
            }

            return {
              kind: "page-mention",
              readAt,
              createdAt,
              entity,
              occurredInEntity: occurredInEntity as Entity<PageProperties>,
              occurredInBlock: occurredInBlock as Entity<BlockProperties>,
              occurredInText: occurredInText as Entity<TextProperties>,
              triggeredByUser,
            } satisfies PageMentionNotification;
          } else if (
            entityTypeId ===
            systemTypes.entityType.commentNotification.entityTypeId
          ) {
            const occurredInEntity = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.occurredInEntity.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            const occurredInBlock = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.occurredInBlock.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            const triggeredByComment = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.triggeredByComment.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            const triggeredByUserEntity = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.triggeredByUser.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            if (
              !occurredInEntity ||
              !occurredInBlock ||
              !triggeredByComment ||
              !triggeredByUserEntity
            ) {
              throw new Error(
                `Comment notification "${entityId}" is missing required links`,
              );
            }

            const triggeredByUser = constructMinimalUser({
              userEntity: triggeredByUserEntity as Entity<UserProperties>,
            });

            const repliedToComment = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemTypes.linkEntityType.repliedToComment.linkEntityTypeId,
              ),
            )?.rightEntity[0];

            if (repliedToComment) {
              return {
                kind: "comment-reply",
                readAt,
                createdAt,
                entity,
                occurredInEntity: occurredInEntity as Entity<PageProperties>,
                occurredInBlock: occurredInBlock as Entity<BlockProperties>,
                triggeredByComment,
                repliedToComment,
                triggeredByUser,
              } satisfies CommentReplyNotification;
            }

            return {
              kind: "new-comment",
              readAt,
              createdAt,
              entity,
              occurredInEntity: occurredInEntity as Entity<PageProperties>,
              occurredInBlock: occurredInBlock as Entity<BlockProperties>,
              triggeredByComment,
              triggeredByUser,
            } satisfies NewCommentNotification;
          }

          throw new Error(`Notification of type "${entityTypeId}" not handled`);
        })
        /**
         * Order the notifications by when their revisions were created
         *
         * @todo: if we ever want to display updated notifications, we will need
         * to sort by their created at timestamps instead (i.e. when the first
         * revision of the entity was created, not the latest)
         */
        .sort((a, b) => {
          if (a.readAt && !b.readAt) {
            return 1;
          } else if (b.readAt && !a.readAt) {
            return -1;
          }

          return b.createdAt.getTime() - a.createdAt.getTime();
        })
    );
  }, [
    notificationRevisionsData,
    notificationsWithOutgoingLinksData,
    loadingNotificationRevisions,
    loadingNotificationsWithOutgoingLinks,
  ]);

  const refetch = useCallback(async () => {
    await Promise.all([
      refetchNotificationRevisions,
      refetchNotificationsWithOutgoingLinks,
    ]);
  }, [refetchNotificationRevisions, refetchNotificationsWithOutgoingLinks]);

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const markNotificationAsRead = useCallback(
    async (params: { notification: Notification }) => {
      const { notification } = params;

      const now = new Date();

      await updateEntity({
        data: {
          entityId: notification.entity.metadata.recordId.entityId,
          entityTypeId: notification.entity.metadata.entityTypeId,
          properties: {
            ...notification.entity.properties,
            [extractBaseUrl(systemTypes.propertyType.readAt.propertyTypeId)]:
              now.toISOString(),
          },
        },
      });

      await refetch();
    },
    [updateEntity, refetch],
  );

  const value = useMemo<NotificationsContextValues>(
    () => ({
      notifications,
      loading:
        loadingNotificationRevisions || loadingNotificationsWithOutgoingLinks,
      refetch,
      markNotificationAsRead,
    }),
    [
      notifications,
      loadingNotificationRevisions,
      loadingNotificationsWithOutgoingLinks,
      refetch,
      markNotificationAsRead,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
};
