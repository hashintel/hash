import { useMutation, useQuery } from "@apollo/client";
import type { Entity } from "@local/hash-graph-sdk/entity";
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
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import type {
  ArchivedPropertyValueWithMetadata,
  CommentNotification,
  Notification,
  ReadAtPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/commentnotification";
import type { GraphChangeNotification } from "@local/hash-isomorphic-utils/system-types/graphchangenotification";
import type { MentionNotification } from "@local/hash-isomorphic-utils/system-types/mentionnotification";
import type { EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
import type { FunctionComponent, PropsWithChildren } from "react";
import { createContext, useCallback, useContext, useMemo } from "react";

import type {
  GetEntitySubgraphQuery,
  GetEntitySubgraphQueryVariables,
  UpdateEntitiesMutation,
  UpdateEntitiesMutationVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../graphql/api-types.gen";
import {
  getEntitySubgraphQuery,
  updateEntitiesMutation,
  updateEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../pages/shared/auth-info-context";
import { pollInterval } from "./poll-interval";

export type NotificationCountContextValues = {
  numberOfUnreadNotifications?: number;
  loading: boolean;
  refetch: () => Promise<void>;
  markNotificationAsRead: (params: {
    notificationEntityId: EntityId;
  }) => Promise<void>;
  markNotificationsAsRead: (params: {
    notificationEntityIds: EntityId[];
  }) => Promise<void>;
  archiveNotification: (params: {
    notificationEntityId: EntityId;
  }) => Promise<void>;
  archiveNotifications: (params: {
    notificationEntityIds: EntityId[];
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

export const NotificationCountContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const {
    data: notificationCountData,
    loading: loadingNotificationCount,
    refetch: refetchNotificationCount,
  } = useQuery<GetEntitySubgraphQuery, GetEntitySubgraphQueryVariables>(
    getEntitySubgraphQuery,
    {
      pollInterval,
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
              pageOrNotificationNotArchivedFilter,
            ],
          },
          graphResolveDepths: zeroedGraphResolveDepths,
          temporalAxes: currentTimeInstantTemporalAxes,
          includeDrafts: false,
          includeCount: true,
          limit: 0,
        },
      },
      skip: !authenticatedUser,
      fetchPolicy: "network-only",
    },
  );

  const refetch = useCallback(async () => {
    await refetchNotificationCount();
  }, [refetchNotificationCount]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

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

      await refetch();
    },
    [updateEntity, refetch],
  );

  const [updateEntities] = useMutation<
    UpdateEntitiesMutation,
    UpdateEntitiesMutationVariables
  >(updateEntitiesMutation);

  const markNotificationsAsRead = useCallback<
    NotificationCountContextValues["markNotificationsAsRead"]
  >(
    async (params) => {
      const now = new Date();

      await updateEntities({
        variables: {
          entityUpdates: params.notificationEntityIds.map(
            (notificationEntityId) => ({
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
            }),
          ),
        },
      });

      await refetch();
    },
    [updateEntities, refetch],
  );

  const archiveNotification = useCallback<
    NotificationCountContextValues["archiveNotification"]
  >(
    async (params) => {
      const { notificationEntityId } = params;

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: notificationEntityId,
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
          },
        },
      });

      await refetch();
    },
    [updateEntity, refetch],
  );

  const archiveNotifications = useCallback<
    NotificationCountContextValues["archiveNotifications"]
  >(
    async (params) => {
      await updateEntities({
        variables: {
          entityUpdates: params.notificationEntityIds.map(
            (notificationEntityId) => ({
              entityId: notificationEntityId,
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
            }),
          ),
        },
      });
      await refetch();
    },
    [updateEntities, refetch],
  );

  const value = useMemo<NotificationCountContextValues>(
    () => ({
      archiveNotification,
      archiveNotifications,
      loading: loadingNotificationCount,
      markNotificationAsRead,
      markNotificationsAsRead,
      numberOfUnreadNotifications: notificationCountData?.getEntitySubgraph,
      refetch,
    }),
    [
      archiveNotification,
      archiveNotifications,
      loadingNotificationCount,
      markNotificationAsRead,
      markNotificationsAsRead,
      notificationCountData,
      refetch,
    ],
  );

  return (
    <NotificationCountContext.Provider value={value}>
      {children}
    </NotificationCountContext.Provider>
  );
};
