import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import { createContext, useCallback, useContext, useMemo } from "react";

import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  pageOrNotificationNotArchivedFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitiesQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import {
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import { summarizeEntitiesQuery } from "../graphql/queries/knowledge/entity.queries";
import {
  archiveNotificationsMutation,
  markNotificationsAsReadMutation,
} from "../graphql/queries/knowledge/notification.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { usePollInterval } from "./use-poll-interval";

import type {
  SummarizeEntitiesQuery,
  SummarizeEntitiesQueryVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
  ArchiveNotificationsMutation,
  ArchiveNotificationsMutationVariables,
  MarkNotificationsAsReadMutation,
  MarkNotificationsAsReadMutationVariables,
} from "../graphql/api-types.gen";
import type { EntityId } from "@blockprotocol/type-system";
import type { FunctionComponent, PropsWithChildren } from "react";

export type NotificationCountContextValues = {
  numberOfUnreadNotifications?: number;
  loading: boolean;
  markNotificationAsRead: (params: {
    notificationEntityId: EntityId;
  }) => Promise<void>;
  /**
   * Mark notifications as read if they link to a specific entity
   */
  markNotificationsAsReadForEntity: (params: {
    targetEntityId: EntityId;
  }) => Promise<void>;
  /**
   * Archive notifications if they link to a specific entity
   */
  archiveNotificationsForEntity: (params: {
    targetEntityId: EntityId;
  }) => Promise<void>;
};

export const NotificationCountContext =
  createContext<null | NotificationCountContextValues>(null);

export const useNotificationCount = () => {
  const notificationCountContext = useContext(NotificationCountContext);

  if (!notificationCountContext) {
    throw new Error("Context missing");
  }

  return notificationCountContext;
};

/**
 * This is app-wide context to provide:
 * 1. The count of notifications
 * 2. The ability to mark notifications as
 *    - read: keeps them visible on the notifications page
 *    - archived: they will no longer be visible, unless specifically sought out
 *
 * The notifications page has separate context which requests all notification data.
 */
export const NotificationCountContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const pollInterval = usePollInterval();

  const {
    data: notificationSummarizeData,
    loading: loadingNotificationSummary,
    refetch: refetchNotificationSummary,
  } = useQuery<SummarizeEntitiesQuery, SummarizeEntitiesQueryVariables>(
    summarizeEntitiesQuery,
    {
      pollInterval,
      variables: {
        request: {
          filter: {
            all: [
              {
                equal: [
                  { path: ["webId"] },
                  { parameter: authenticatedUser?.accountId },
                ],
              },
              {
                equal: [
                  { path: ["type", "baseUrl"] },
                  {
                    parameter: systemEntityTypes.notification.entityTypeBaseUrl,
                  },
                ],
              },
              pageOrNotificationNotArchivedFilter,
              {
                not: {
                  exists: {
                    path: [
                      "properties",
                      systemPropertyTypes.readAt.propertyTypeBaseUrl,
                    ],
                  },
                },
              },
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includeCount: true,
        },
      },
      skip: !authenticatedUser?.accountSignupComplete,
      fetchPolicy: "network-only",
    },
  );

  const [queryEntities] = useLazyQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, {
    fetchPolicy: "network-only",
  });

  const [markNotificationsAsRead] = useMutation<
    MarkNotificationsAsReadMutation,
    MarkNotificationsAsReadMutationVariables
  >(markNotificationsAsReadMutation, {
    onCompleted: () => refetchNotificationSummary(),
  });

  const [archiveNotifications] = useMutation<
    ArchiveNotificationsMutation,
    ArchiveNotificationsMutationVariables
  >(archiveNotificationsMutation, {
    onCompleted: () => refetchNotificationSummary(),
  });

  const getNotificationsLinkingToEntity = useCallback(
    async ({ targetEntityId }: { targetEntityId: EntityId }) => {
      const relatedNotificationData = await queryEntities({
        variables: {
          request: {
            filter: {
              all: [
                {
                  equal: [
                    { path: ["webId"] },
                    { parameter: authenticatedUser?.accountId },
                  ],
                },

                {
                  equal: [
                    { path: ["type", "baseUrl"] },
                    {
                      parameter:
                        systemEntityTypes.notification.entityTypeBaseUrl,
                    },
                  ],
                },
                {
                  equal: [
                    { path: ["outgoingLinks", "rightEntity", "uuid"] },
                    {
                      parameter: extractEntityUuidFromEntityId(targetEntityId),
                    },
                  ],
                },
              ],
            },
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: false,
            includePermissions: false,
          },
        },
      });

      if (!relatedNotificationData.data?.queryEntities) {
        return [];
      }

      return deserializeQueryEntitiesResponse(
        relatedNotificationData.data.queryEntities,
      ).entities;
    },
    [authenticatedUser?.accountId, queryEntities],
  );

  const markNotificationAsRead = useCallback<
    NotificationCountContextValues["markNotificationAsRead"]
  >(
    async (params) => {
      const { notificationEntityId } = params;

      await markNotificationsAsRead({
        variables: {
          notificationEntityIds: [notificationEntityId],
        },
      });
    },
    [markNotificationsAsRead],
  );

  const markNotificationsAsReadForEntity = useCallback<
    NotificationCountContextValues["markNotificationsAsReadForEntity"]
  >(
    async (params) => {
      const { targetEntityId } = params;

      const notifications = await getNotificationsLinkingToEntity({
        targetEntityId,
      });

      if (notifications.length) {
        await markNotificationsAsRead({
          variables: {
            notificationEntityIds: notifications.map(
              (notification) => notification.metadata.recordId.entityId,
            ),
          },
        });
      }
    },
    [getNotificationsLinkingToEntity, markNotificationsAsRead],
  );

  const archiveNotificationsForEntity = useCallback<
    NotificationCountContextValues["archiveNotificationsForEntity"]
  >(
    async (params) => {
      const { targetEntityId } = params;

      const notifications = await getNotificationsLinkingToEntity({
        targetEntityId,
      });

      if (notifications.length) {
        await archiveNotifications({
          variables: {
            notificationEntityIds: notifications.map(
              (notification) => notification.metadata.recordId.entityId,
            ),
          },
        });
      }
    },
    [archiveNotifications, getNotificationsLinkingToEntity],
  );

  const value = useMemo<NotificationCountContextValues>(
    () => ({
      archiveNotificationsForEntity,
      loading: loadingNotificationSummary,
      markNotificationAsRead,
      markNotificationsAsReadForEntity,
      numberOfUnreadNotifications:
        notificationSummarizeData?.summarizeEntities.count ?? undefined,
    }),
    [
      archiveNotificationsForEntity,
      loadingNotificationSummary,
      markNotificationAsRead,
      markNotificationsAsReadForEntity,
      notificationSummarizeData,
    ],
  );

  return (
    <NotificationCountContext.Provider value={value}>
      {children}
    </NotificationCountContext.Provider>
  );
};
