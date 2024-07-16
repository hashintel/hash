import { useMutation, useQuery } from "@apollo/client";
import type { Entity } from "@local/hash-graph-sdk/entity";
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

export type NotificationEntitiesContextValues = {
  notificationEntities?: Entity<
    | Notification
    | MentionNotification
    | CommentNotification
    | GraphChangeNotification
  >[];
  numberOfUnreadNotifications?: number;
  loading: boolean;
  refetch: () => Promise<void>;
  markNotificationAsRead: (params: {
    notificationEntity: Entity;
  }) => Promise<void>;
  markNotificationsAsRead: (params: {
    notificationEntities: Entity[];
  }) => Promise<void>;
  archiveNotification: (params: {
    notificationEntity: Entity;
  }) => Promise<void>;
  archiveNotifications: (params: {
    notificationEntities: Entity[];
  }) => Promise<void>;
};

export const NotificationEntitiesContext =
  createContext<null | NotificationEntitiesContextValues>(null);

export const useNotificationEntities = () => {
  const notificationsEntitiesContext = useContext(NotificationEntitiesContext);

  if (!notificationsEntitiesContext) {
    throw new Error("Context missing");
  }

  return notificationsEntitiesContext;
};

export const NotificationEntitiesContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const {
    data: notificationEntitiesData,
    loading: loadingNotificationEntities,
    refetch: refetchNotificationEntities,
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
        },
      },
      skip: !authenticatedUser,
      fetchPolicy: "network-only",
    },
  );

  const notificationEntitiesSubgraph = useMemo(
    () =>
      notificationEntitiesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType<Notification>>(
            notificationEntitiesData.getEntitySubgraph.subgraph,
          )
        : undefined,
    [notificationEntitiesData],
  );

  const notificationEntities = useMemo<
    | Entity<
        | Notification
        | MentionNotification
        | CommentNotification
        | GraphChangeNotification
      >[]
    | undefined
  >(
    () =>
      notificationEntitiesSubgraph
        ? getRoots(notificationEntitiesSubgraph)
        : undefined,
    [notificationEntitiesSubgraph],
  );

  const refetch = useCallback(async () => {
    await refetchNotificationEntities();
  }, [refetchNotificationEntities]);

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const markNotificationAsRead = useCallback(
    async (params: { notificationEntity: Entity }) => {
      const { notificationEntity } = params;

      const now = new Date();

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: notificationEntity.metadata.recordId.entityId,
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

  const markNotificationsAsRead = useCallback(
    async (params: { notificationEntities: Entity[] }) => {
      const now = new Date();

      await updateEntities({
        variables: {
          entityUpdates: params.notificationEntities.map(
            (notificationEntity) => ({
              entityId: notificationEntity.metadata.recordId.entityId,
              entityTypeId: notificationEntity.metadata.entityTypeId,
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

  const archiveNotification = useCallback(
    async (params: { notificationEntity: Entity; shouldRefetch?: boolean }) => {
      const { notificationEntity, shouldRefetch = true } = params;

      await updateEntity({
        variables: {
          entityUpdate: {
            entityId: notificationEntity.metadata.recordId.entityId,
            entityTypeId: notificationEntity.metadata.entityTypeId,
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

      if (shouldRefetch) {
        await refetch();
      }
    },
    [updateEntity, refetch],
  );

  const archiveNotifications = useCallback(
    async (params: { notificationEntities: Entity[] }) => {
      await updateEntities({
        variables: {
          entityUpdates: params.notificationEntities.map(
            (notificationEntity) => ({
              entityId: notificationEntity.metadata.recordId.entityId,
              entityTypeId: notificationEntity.metadata.entityTypeId,
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

  const numberOfUnreadNotifications = useMemo(
    () =>
      notificationEntities?.filter(({ properties }) => {
        const { readAt } = simplifyProperties(properties);

        return !readAt;
      }).length,
    [notificationEntities],
  );

  const value = useMemo<NotificationEntitiesContextValues>(
    () => ({
      notificationEntities,
      numberOfUnreadNotifications,
      loading: loadingNotificationEntities,
      archiveNotifications,
      refetch,
      markNotificationAsRead,
      markNotificationsAsRead,
      archiveNotification,
    }),
    [
      notificationEntities,
      numberOfUnreadNotifications,
      archiveNotifications,
      loadingNotificationEntities,
      refetch,
      markNotificationAsRead,
      markNotificationsAsRead,
      archiveNotification,
    ],
  );

  return (
    <NotificationEntitiesContext.Provider value={value}>
      {children}
    </NotificationEntitiesContext.Provider>
  );
};
