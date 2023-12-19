import { useQuery } from "@apollo/client";
import { VersionedUrl } from "@blockprotocol/type-system";
import { Filter } from "@local/hash-graph-client";
import {
  getFirstEntityRevision,
  TextProperties,
} from "@local/hash-isomorphic-utils/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  SimpleProperties,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";
import {
  BlockProperties,
  CommentNotificationProperties,
  CommentProperties,
  NotificationProperties,
  OccurredInEntityProperties,
  PageProperties,
  UserProperties,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import { GraphChangeNotificationProperties } from "@local/hash-isomorphic-utils/system-types/graphchangenotification";
import { MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import {
  Entity,
  EntityRootType,
  extractEntityUuidFromEntityId,
  LinkEntityAndRightEntity,
} from "@local/hash-subgraph";
import { getOutgoingLinkAndTargetEntities } from "@local/hash-subgraph/stdlib";
import { useMemo, useRef } from "react";

import {
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
} from "../../graphql/api-types.gen";
import { structuralQueryEntitiesQuery } from "../../graphql/queries/knowledge/entity.queries";
import { constructMinimalUser, MinimalUser } from "../../lib/user-and-org";
import { useNotificationEntities } from "../../shared/notification-entities-context";

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

export type PageRelatedNotification =
  | PageMentionNotification
  | CommentMentionNotification
  | NewCommentNotification
  | CommentReplyNotification;

export type GraphChangeNotification = {
  createdAt: Date;
  entity: Entity<GraphChangeNotificationProperties>;
  kind: "graph-change";
  occurredInEntityEditionTimestamp: string | undefined;
  occurredInEntityLabel: string;
  occurredInEntity: Entity;
  operation: string;
} & SimpleProperties<NotificationProperties>;

export type Notification = PageRelatedNotification | GraphChangeNotification;

const isLinkAndRightEntityWithLinkType =
  (linkEntityTypeId: VersionedUrl) =>
  ({ linkEntity }: LinkEntityAndRightEntity) =>
    linkEntity[0] && linkEntity[0].metadata.entityTypeId === linkEntityTypeId;

export const useNotificationsWithLinks = (): {
  notifications?: Notification[];
} => {
  const { notificationEntities } = useNotificationEntities();

  const getNotificationEntitiesFilter = useMemo<Filter>(
    () => ({
      any:
        notificationEntities?.map((draftEntity) => ({
          equal: [
            { path: ["uuid"] },
            {
              parameter: extractEntityUuidFromEntityId(
                draftEntity.metadata.recordId.entityId,
              ),
            },
          ],
        })) ?? [],
    }),
    [notificationEntities],
  );

  const { data: notificationsWithOutgoingLinksData } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: getNotificationEntitiesFilter,
        graphResolveDepths: {
          ...zeroedGraphResolveDepths,
          inheritsFrom: { outgoing: 255 },
          isOfType: { outgoing: 1 },
          // Retrieve the outgoing linked entities of the notification entity at depth 1
          hasLeftEntity: { outgoing: 0, incoming: 1 },
          hasRightEntity: { outgoing: 1, incoming: 0 },
        },
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
      },
    },
    skip: !notificationEntities || notificationEntities.length === 0,
    fetchPolicy: "network-only",
  });

  const outgoingLinksSubgraph = useMemo(
    () =>
      notificationsWithOutgoingLinksData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            notificationsWithOutgoingLinksData.structuralQueryEntities.subgraph,
          )
        : undefined,
    [notificationsWithOutgoingLinksData],
  );

  const {
    data: notificationRevisionsData,
    loading: loadingNotificationRevisions,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: {
      includePermissions: false,
      query: {
        filter: getNotificationEntitiesFilter,
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
        includeDrafts: false,
      },
    },
    skip: !notificationEntities || notificationEntities.length === 0,
    fetchPolicy: "network-only",
  });

  const previouslyFetchedNotificationsRef = useRef<Notification[] | null>(null);

  const notifications = useMemo<Notification[] | undefined>(() => {
    if (
      !outgoingLinksSubgraph ||
      !notificationEntities ||
      !notificationRevisionsData ||
      loadingNotificationRevisions
    ) {
      return previouslyFetchedNotificationsRef.current ?? undefined;
    }

    const revisionsSubgraph =
      mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
        notificationRevisionsData.structuralQueryEntities.subgraph,
      );

    /**
     * For some reason the revisionsSubgraph query can return an empty subgraph occasionally
     * @todo figure out why H-1706
     */
    if (notificationEntities.length && !revisionsSubgraph.roots.length) {
      return previouslyFetchedNotificationsRef.current ?? undefined;
    }

    const derivedNotifications = notificationEntities
      .map((entity) => {
        const {
          metadata: {
            entityTypeId,
            recordId: { entityId },
          },
        } = entity;

        const firstRevision = getFirstEntityRevision(
          revisionsSubgraph,
          entityId,
        );

        const createdAt = new Date(
          firstRevision.metadata.temporalVersioning.decisionTime.start.limit,
        );

        const { readAt } = simplifyProperties(entity.properties);

        const outgoingLinks = getOutgoingLinkAndTargetEntities(
          outgoingLinksSubgraph,
          entityId,
        );

        if (
          entityTypeId === systemEntityTypes.mentionNotification.entityTypeId
        ) {
          const occurredInEntity = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
            ),
          )?.rightEntity[0];

          const occurredInBlock = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
            ),
          )?.rightEntity[0];

          const occurredInText = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.occurredInText.linkEntityTypeId,
            ),
          )?.rightEntity[0];

          const triggeredByUserEntity = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
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
              systemLinkEntityTypes.occurredInComment.linkEntityTypeId,
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
              occurredInComment: occurredInComment as Entity<CommentProperties>,
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
          entityTypeId === systemEntityTypes.commentNotification.entityTypeId
        ) {
          const occurredInEntity = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
            ),
          )?.rightEntity[0];

          const occurredInBlock = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.occurredInBlock.linkEntityTypeId,
            ),
          )?.rightEntity[0];

          const triggeredByComment = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.triggeredByComment.linkEntityTypeId,
            ),
          )?.rightEntity[0];

          const triggeredByUserEntity = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.triggeredByUser.linkEntityTypeId,
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
              systemLinkEntityTypes.repliedToComment.linkEntityTypeId,
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
        } else if (
          entityTypeId ===
          systemEntityTypes.graphChangeNotification.entityTypeId
        ) {
          const occurredInEntityLink = outgoingLinks.find(
            isLinkAndRightEntityWithLinkType(
              systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
            ),
          );

          if (!occurredInEntityLink) {
            throw new Error(
              `Graph change notification "${entityId}" is missing required links`,
            );
          }

          const occurredInEntityEditionTimestamp = (
            occurredInEntityLink
              .linkEntity[0] as Entity<OccurredInEntityProperties>
          ).properties[
            "https://hash.ai/@hash/types/property-type/entity-edition-id/"
          ];

          if (!occurredInEntityEditionTimestamp) {
            throw new Error(
              `Graph change notification "${entityId}" Occurred In Entity link is missing required entityEditionId property`,
            );
          }

          const occurredInEntity = occurredInEntityLink.rightEntity[0];
          if (!occurredInEntity) {
            // @todo archive the notification when the entity it occurred in is archived
            return null;
          }

          const graphChangeEntity =
            entity as Entity<GraphChangeNotificationProperties>;

          return {
            kind: "graph-change",
            createdAt: new Date(occurredInEntityEditionTimestamp),
            readAt,
            entity: graphChangeEntity,
            occurredInEntityLabel: generateEntityLabel(
              outgoingLinksSubgraph,
              occurredInEntity,
            ),
            occurredInEntityEditionTimestamp,
            occurredInEntity,
            operation:
              graphChangeEntity.properties[
                "https://hash.ai/@hash/types/property-type/graph-change-type/"
              ],
          } satisfies GraphChangeNotification;
        }
        throw new Error(`Notification of type "${entityTypeId}" not handled`);
      })
      .filter(
        (notification): notification is NonNullable<typeof notification> =>
          !!notification,
      )
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

        const timeDifference = b.createdAt.getTime() - a.createdAt.getTime();
        if (timeDifference !== 0) {
          return timeDifference;
        }
        return a.entity.metadata.recordId.entityId >
          b.entity.metadata.recordId.entityId
          ? 1
          : -1;
      });

    previouslyFetchedNotificationsRef.current = derivedNotifications;

    return derivedNotifications;
  }, [
    notificationEntities,
    notificationRevisionsData,
    outgoingLinksSubgraph,
    loadingNotificationRevisions,
  ]);

  return { notifications };
};
