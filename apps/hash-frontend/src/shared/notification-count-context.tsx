import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import type { BaseUrl, EntityId } from "@blockprotocol/type-system";
import { extractEntityUuidFromEntityId } from "@blockprotocol/type-system";
import { deserializeQueryEntitiesResponse } from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  pageOrNotificationNotArchivedFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { queryEntitiesQuery } from "@local/hash-isomorphic-utils/graphql/queries/entity.queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  ArchivedPropertyValueWithMetadata,
  Notification,
  ReadAtPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

import type {
  CountEntitiesQuery,
  CountEntitiesQueryVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
  UpdateEntitiesMutation,
  UpdateEntitiesMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../graphql/api-types.gen";
import {
  countEntitiesQuery,
  updateEntitiesMutation,
  updateEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { usePollInterval } from "./use-poll-interval";

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
    data: notificationCountData,
    loading: loadingNotificationCount,
    refetch: refetchNotificationCount,
  } = useQuery<CountEntitiesQuery, CountEntitiesQueryVariables>(
    countEntitiesQuery,
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
              generateVersionedUrlMatchingFilter(
                systemEntityTypes.notification.entityTypeId,
                { ignoreParents: false },
              ),
              pageOrNotificationNotArchivedFilter,
            ],
          },
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
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

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation, {
    onCompleted: () => refetchNotificationCount(),
  });

  const [updateEntities] = useMutation<
    UpdateEntitiesMutation,
    UpdateEntitiesMutationVariables
  >(updateEntitiesMutation, {
    onCompleted: () => refetchNotificationCount(),
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
                generateVersionedUrlMatchingFilter(
                  systemEntityTypes.notification.entityTypeId,
                  { ignoreParents: false },
                ),
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

      const now = new Date();

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: notificationEntityId,
            propertyPatches: [
              {
                op: "add",
                path: [
                  "https://hash.ai/@h/types/property-type/read-at/" satisfies keyof Notification["properties"] as BaseUrl,
                ],
                property: {
                  value: now.toISOString(),
                  metadata: {
                    dataTypeId:
                      "https://hash.ai/@h/types/data-type/datetime/v/1",
                  },
                } satisfies ReadAtPropertyValueWithMetadata,
              },
            ],
          },
        },
      });
    },
    [updateEntity],
  );

  const markNotificationsAsReadForEntity = useCallback<
    NotificationCountContextValues["markNotificationsAsReadForEntity"]
  >(
    async (params) => {
      const now = new Date();

      const { targetEntityId } = params;

      const notifications = await getNotificationsLinkingToEntity({
        targetEntityId,
      });

      if (notifications.length) {
        await updateEntities({
          variables: {
            entityUpdates: notifications.map((notification) => ({
              entityId: notification.metadata.recordId.entityId,
              propertyPatches: [
                {
                  op: "add",
                  path: [
                    "https://hash.ai/@h/types/property-type/read-at/" satisfies keyof Notification["properties"] as BaseUrl,
                  ],
                  property: {
                    value: now.toISOString(),
                    metadata: {
                      dataTypeId:
                        "https://hash.ai/@h/types/data-type/datetime/v/1",
                    },
                  } satisfies ReadAtPropertyValueWithMetadata,
                },
              ],
            })),
          },
        });
      }
    },
    [getNotificationsLinkingToEntity, updateEntities],
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
        await updateEntities({
          variables: {
            entityUpdates: notifications.map((notification) => ({
              entityId: notification.metadata.recordId.entityId,
              propertyPatches: [
                {
                  op: "add",
                  path: [
                    "https://hash.ai/@h/types/property-type/archived/" satisfies keyof Notification["properties"] as BaseUrl,
                  ],
                  property: {
                    value: true,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
                    },
                  } satisfies ArchivedPropertyValueWithMetadata,
                },
              ],
            })),
          },
        });
      }
    },
    [getNotificationsLinkingToEntity, updateEntities],
  );

  const value = useMemo<NotificationCountContextValues>(
    () => ({
      archiveNotificationsForEntity,
      loading: loadingNotificationCount,
      markNotificationAsRead,
      markNotificationsAsReadForEntity,
      numberOfUnreadNotifications:
        notificationCountData?.countEntities ?? undefined,
    }),
    [
      archiveNotificationsForEntity,
      loadingNotificationCount,
      markNotificationAsRead,
      markNotificationsAsReadForEntity,
      notificationCountData,
    ],
  );

  return (
    <NotificationCountContext.Provider value={value}>
      {children}
    </NotificationCountContext.Provider>
  );
};
