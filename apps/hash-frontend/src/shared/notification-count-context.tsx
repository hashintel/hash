import { useLazyQuery, useMutation, useQuery } from "@apollo/client";
import type { EntityId } from "@local/hash-graph-types/entity";
import type { BaseUrl } from "@local/hash-graph-types/ontology";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  pageOrNotificationNotArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  ArchivedPropertyValueWithMetadata,
  Notification,
  ReadAtPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import type { EntityRootType } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

import type {
  CountEntitiesQuery,
  CountEntitiesQueryVariables,
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  UpdateEntitiesMutation,
  UpdateEntitiesMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../graphql/api-types.gen";
import {
  countEntitiesQuery,
  getEntitySubgraphQuery,
  updateEntitiesMutation,
  updateEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { pollInterval } from "./poll-interval";

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
                  { path: ["ownedById"] },
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
      skip: !authenticatedUser,
      fetchPolicy: "network-only",
    },
  );

  const [getEntitySubgraph] = useLazyQuery<
    GetEntitySubgraphQuery,
    GetEntitySubgraphQueryVariables
  >(getEntitySubgraphQuery, {
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
      const relatedNotificationData = await getEntitySubgraph({
        variables: {
          includePermissions: false,
          request: {
            filter: {
              all: [
                {
                  equal: [
                    { path: ["ownedById"] },
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
            graphResolveDepths: zeroedGraphResolveDepths,
            temporalAxes: currentTimeInstantTemporalAxes,
            includeDrafts: false,
          },
        },
      });

      if (!relatedNotificationData.data?.getEntitySubgraph.subgraph) {
        return [];
      }

      const subgraph = mapGqlSubgraphFieldsFragmentToSubgraph<
        EntityRootType<Notification>
      >(relatedNotificationData.data.getEntitySubgraph.subgraph);

      const notifications = getRoots(subgraph);

      return notifications;
    },
    [authenticatedUser?.accountId, getEntitySubgraph],
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
                  "https://hash.ai/@hash/types/property-type/read-at/" satisfies keyof Notification["properties"] as BaseUrl,
                ],
                property: {
                  value: now.toISOString(),
                  metadata: {
                    dataTypeId:
                      "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
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
                    "https://hash.ai/@hash/types/property-type/read-at/" satisfies keyof Notification["properties"] as BaseUrl,
                  ],
                  property: {
                    value: now.toISOString(),
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
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
                    "https://hash.ai/@hash/types/property-type/archived/" satisfies keyof Notification["properties"] as BaseUrl,
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
