import { useQuery } from "@apollo/client";
import type { VersionedUrl } from "@blockprotocol/type-system";
import { typedEntries, typedValues } from "@local/advanced-types/typed-entries";
import type { Entity } from "@local/hash-graph-sdk/entity";
import type { TextWithTokens } from "@local/hash-isomorphic-utils/entity";
import { generateEntityLabel } from "@local/hash-isomorphic-utils/generate-entity-label";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  pageOrNotificationNotArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type { SimpleProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  Block as BlockProperties,
  Comment as CommentProperties,
  CommentNotification as CommentNotificationProperties,
  Notification as NotificationProperties,
  OccurredInEntity as OccurredInEntityProperties,
  Page as PageProperties,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import type { GraphChangeNotification as GraphChangeNotificationProperties } from "@local/hash-isomorphic-utils/system-types/graphchangenotification";
import type { MentionNotification as MentionNotificationProperties } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import type { User as UserProperties } from "@local/hash-isomorphic-utils/system-types/user";
import type {
  EntityRootType,
  EntityVertex,
  LinkEntityAndRightEntity,
} from "@local/hash-subgraph";
import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@local/hash-subgraph/stdlib";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useContext, useMemo, useRef } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import { getEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import type { MinimalUser } from "../../lib/user-and-org";
import { constructMinimalUser } from "../../lib/user-and-org";
import { pollInterval } from "../../shared/poll-interval";
import { useAuthInfo } from "../shared/auth-info-context";

export type PageMentionNotification = {
  kind: "page-mention";
  entity: Entity<MentionNotificationProperties>;
  occurredInEntity: Entity<PageProperties>;
  occurredInBlock: Entity<BlockProperties>;
  occurredInText: Entity<TextWithTokens>;
  triggeredByUser: MinimalUser;
} & SimpleProperties<MentionNotificationProperties["properties"]>;

export type CommentMentionNotification = {
  kind: "comment-mention";
  occurredInComment: Entity<CommentProperties>;
} & Omit<PageMentionNotification, "kind">;

export type NewCommentNotification = {
  kind: "new-comment";
  entity: Entity<CommentNotificationProperties>;
  occurredInEntity: Entity<PageProperties>;
  occurredInBlock: Entity<BlockProperties>;
  triggeredByComment: Entity<CommentProperties>;
  triggeredByUser: MinimalUser;
} & SimpleProperties<CommentNotificationProperties["properties"]>;

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
  entity: Entity<GraphChangeNotificationProperties>;
  kind: "graph-change";
  occurredInEntityEditionTimestamp: string | undefined;
  occurredInEntityLabel: string;
  occurredInEntity: Entity;
  operation: string;
} & SimpleProperties<NotificationProperties["properties"]>;

export type Notification = PageRelatedNotification | GraphChangeNotification;

type NotificationsWithLinksContextValue = {
  notifications?: Notification[];
  refetch: () => void;
};

export const NotificationsWithLinksContext =
  createContext<null | NotificationsWithLinksContextValue>(null);

export const useNotificationsWithLinks = () => {
  const notificationsWithLinksContext = useContext(
    NotificationsWithLinksContext,
  );

  if (!notificationsWithLinksContext) {
    throw new Error("Context missing");
  }

  return notificationsWithLinksContext;
};

const isLinkAndRightEntityWithLinkType =
  (linkEntityTypeId: VersionedUrl) =>
  ({ linkEntity }: LinkEntityAndRightEntity) =>
    linkEntity[0] &&
    linkEntity[0].metadata.entityTypeIds.includes(linkEntityTypeId);

export const useNotificationsWithLinksContextValue =
  (): NotificationsWithLinksContextValue => {
    const { authenticatedUser } = useAuthInfo();

    const { data: notificationsWithOutgoingLinksData, refetch } = useQuery<
      GetEntitySubgraphQuery,
      GetEntitySubgraphQueryVariables
    >(getEntitySubgraphQuery, {
      variables: {
        includePermissions: false,
        request: {
          filter: {
            all: [
              {
                equal: [
                  { path: ["webId"] },
                  { parameter: authenticatedUser?.accountId },
                ],
              },
              generateVersionedUrlMatchingFilter(
                systemEntityTypes.notification.entityTypeId,
                { ignoreParents: false },
              ),
              pageOrNotificationNotArchivedFilter,
            ],
          },
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
      skip: !authenticatedUser,
      fetchPolicy: "network-only",
      pollInterval,
    });

    const notificationsSubgraph = useMemo(
      () =>
        notificationsWithOutgoingLinksData
          ? mapGqlSubgraphFieldsFragmentToSubgraph<
              EntityRootType<NotificationProperties>
            >(notificationsWithOutgoingLinksData.getEntitySubgraph.subgraph)
          : undefined,
      [notificationsWithOutgoingLinksData],
    );

    const previouslyFetchedNotificationsRef = useRef<Notification[] | null>(
      null,
    );

    const notifications = useMemo<Notification[] | undefined>(() => {
      if (!notificationsSubgraph) {
        return previouslyFetchedNotificationsRef.current ?? undefined;
      }

      const notificationEntities = getRoots(notificationsSubgraph);

      const derivedNotifications = notificationEntities
        .map((entity) => {
          const {
            metadata: {
              entityTypeIds,
              recordId: { entityId },
            },
          } = entity;

          const { readAt } = simplifyProperties(entity.properties);

          const outgoingLinks = getOutgoingLinkAndTargetEntities(
            notificationsSubgraph,
            entityId,
          );

          if (
            entityTypeIds.includes(
              systemEntityTypes.mentionNotification.entityTypeId,
            )
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
                entity:
                  entity as unknown as Entity<MentionNotificationProperties>,
                occurredInEntity: occurredInEntity as Entity<PageProperties>,
                occurredInBlock: occurredInBlock as Entity<BlockProperties>,
                occurredInText: occurredInText as Entity<TextWithTokens>,
                triggeredByUser,
                occurredInComment:
                  occurredInComment as Entity<CommentProperties>,
              } satisfies CommentMentionNotification;
            }

            return {
              kind: "page-mention",
              readAt,
              entity:
                entity as unknown as Entity<MentionNotificationProperties>,
              occurredInEntity: occurredInEntity as Entity<PageProperties>,
              occurredInBlock: occurredInBlock as Entity<BlockProperties>,
              occurredInText: occurredInText as Entity<TextWithTokens>,
              triggeredByUser,
            } satisfies PageMentionNotification;
          } else if (
            entityTypeIds.includes(
              systemEntityTypes.commentNotification.entityTypeId,
            )
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
                entity:
                  entity as unknown as Entity<CommentNotificationProperties>,
                occurredInEntity: occurredInEntity as Entity<PageProperties>,
                occurredInBlock: occurredInBlock as Entity<BlockProperties>,
                triggeredByComment:
                  triggeredByComment as Entity<CommentProperties>,
                repliedToComment: repliedToComment as Entity<CommentProperties>,
                triggeredByUser,
              } satisfies CommentReplyNotification;
            }

            return {
              kind: "new-comment",
              readAt,
              entity:
                entity as unknown as Entity<CommentNotificationProperties>,
              occurredInEntity: occurredInEntity as Entity<PageProperties>,
              occurredInBlock: occurredInBlock as Entity<BlockProperties>,
              triggeredByComment:
                triggeredByComment as Entity<CommentProperties>,
              triggeredByUser,
            } satisfies NewCommentNotification;
          } else if (
            entityTypeIds.includes(
              systemEntityTypes.graphChangeNotification.entityTypeId,
            )
          ) {
            const occurredInEntityLink = outgoingLinks.find(
              isLinkAndRightEntityWithLinkType(
                systemLinkEntityTypes.occurredInEntity.linkEntityTypeId,
              ),
            );

            const linkRightEntityId =
              occurredInEntityLink?.linkEntity[0]?.linkData?.rightEntityId;

            if (!occurredInEntityLink || !linkRightEntityId) {
              throw new Error(
                `Graph change notification "${entityId}" is missing required links`,
              );
            }

            const occurredInEntityEditionTimestamp = (
              occurredInEntityLink
                .linkEntity[0] as Entity<OccurredInEntityProperties>
            ).properties[
              "https://hash.ai/@h/types/property-type/entity-edition-id/"
            ];

            if (!occurredInEntityEditionTimestamp) {
              throw new Error(
                `Graph change notification "${entityId}" Occurred In Entity link is missing required entityEditionId property`,
              );
            }

            let occurredInEntity: Entity | undefined;
            for (const [vertexKey, editionMap] of typedEntries(
              notificationsSubgraph.vertices,
            )) {
              /**
               * The created/updated record might be a draft, in which case it is keyed in the subgraph by
               * `${entityId}~${draftId}`. We need to find the vertex that _starts with_ the entityId and contains an
               * edition at the exact timestamp from the link. Needing to do this is a limitation caused by:
               * 1. The fact that links only point to the entire Entity, not any specific edition or draft series of it
               * 2. The logic for returning linked entities from the subgraph library will just return the non-draft
               * entity if it is found
               */
              if (!vertexKey.startsWith(linkRightEntityId)) {
                continue;
              }

              const editions = typedValues(editionMap).flat();

              /**
               * We have a candidate – this might be one of multiple draft series for the entity, or the single live
               * series. We match the timestamp logged in the link to the editions of the entity. This may result in a
               * false positive if the live entity and any of its drafts have editions at the exact same timestamp.
               */
              occurredInEntity = editions.find(
                (vertex): vertex is EntityVertex =>
                  vertex.kind === "entity" &&
                  vertex.inner.metadata.temporalVersioning.decisionTime.start
                    .limit === occurredInEntityEditionTimestamp,
              )?.inner;

              if (occurredInEntity) {
                break;
              }

              /**
               * If the entity has been updated since the notification was created, we won't have the edition in the
               * subgraph, because the request above only fetches editions still valid for the current timestamp. In
               * order to show the notification we just take any available edition.
               *
               * The other option would be to fetch the entire history for all entities which are the subject of a
               * notification, but this might be a lot of data.
               */
              const anyAvailableEdition = editions.find(
                (vertex): vertex is EntityVertex => vertex.kind === "entity",
              )?.inner;

              if (anyAvailableEdition) {
                occurredInEntity = anyAvailableEdition;
                break;
              }
            }

            if (!occurredInEntity) {
              // @todo archive the notification when the entity it occurred in is archived
              return null;
            }

            const graphChangeEntity =
              entity as unknown as Entity<GraphChangeNotificationProperties>;

            return {
              kind: "graph-change",
              readAt,
              entity: graphChangeEntity,
              occurredInEntityLabel: generateEntityLabel(
                notificationsSubgraph,
                occurredInEntity,
              ),
              occurredInEntityEditionTimestamp,
              occurredInEntity,
              operation:
                graphChangeEntity.properties[
                  "https://hash.ai/@h/types/property-type/graph-change-type/"
                ],
            } satisfies GraphChangeNotification;
          }
          throw new Error(
            `Notification with type(s) "${entityTypeIds.join(", ")}" not handled`,
          );
        })
        .filter(
          (notification): notification is NonNullable<typeof notification> =>
            !!notification,
        )

        .sort((a, b) => {
          if (a.readAt && !b.readAt) {
            return 1;
          } else if (b.readAt && !a.readAt) {
            return -1;
          }

          const aCreatedAt = new Date(
            a.entity.metadata.provenance.createdAtDecisionTime,
          );
          const bCreatedAt = new Date(
            b.entity.metadata.provenance.createdAtDecisionTime,
          );

          const timeDifference = bCreatedAt.getTime() - aCreatedAt.getTime();
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
    }, [notificationsSubgraph]);

    return { notifications, refetch };
  };

/**
 * Context to provide full information on notifications, for use on the notifications page.
 * A separate app-wide context provides only a count of notifications.
 */
export const NotificationsWithLinksContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const value = useNotificationsWithLinksContextValue();

  return (
    <NotificationsWithLinksContext.Provider value={value}>
      {children}
    </NotificationsWithLinksContext.Provider>
  );
};
