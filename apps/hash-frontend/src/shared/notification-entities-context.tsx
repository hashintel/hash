import { useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  notArchivedFilter,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { systemEntityTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";
import { simplifyProperties } from "@local/hash-isomorphic-utils/simplify-properties";
import { NotificationProperties } from "@local/hash-isomorphic-utils/system-types/commentnotification";
import { Entity, EntityRootType } from "@local/hash-subgraph";
import { getRoots } from "@local/hash-subgraph/stdlib";
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
import { useAuthInfo } from "../pages/shared/auth-info-context";

export type NotificationEntitiesContextValues = {
  notificationEntities?: Entity<NotificationProperties>[];
  numberOfUnreadNotifications?: number;
  loading: boolean;
  refetch: () => Promise<void>;
  markNotificationAsRead: (params: {
    notificationEntity: Entity;
  }) => Promise<void>;
  archiveNotification: (params: {
    notificationEntity: Entity;
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

const fetchNotificationPollInterval = 5_000;

export const NotificationEntitiesContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const { authenticatedUser } = useAuthInfo();

  const {
    data: notificationEntitiesData,
    loading: loadingNotificationEntities,
    refetch: refetchNotificationEntities,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    pollInterval: fetchNotificationPollInterval,
    variables: {
      includePermissions: false,
      query: {
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
            notArchivedFilter,
          ],
        },
        graphResolveDepths: zeroedGraphResolveDepths,
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: true,
      },
    },
    skip: !authenticatedUser,
    fetchPolicy: "network-only",
  });

  const notificationEntitiesSubgraph = useMemo(
    () =>
      notificationEntitiesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            notificationEntitiesData.structuralQueryEntities.subgraph,
          )
        : undefined,
    [notificationEntitiesData],
  );

  const notificationEntities = useMemo<
    Entity<NotificationProperties>[] | undefined
  >(
    () =>
      notificationEntitiesSubgraph
        ? getRoots(notificationEntitiesSubgraph)
        : notificationEntitiesSubgraph,
    [notificationEntitiesSubgraph],
  );

  const refetch = useCallback(async () => {
    await refetchNotificationEntities();
  }, [refetchNotificationEntities]);

  const { updateEntity } = useBlockProtocolUpdateEntity();

  const markNotificationAsRead = useCallback(
    async (params: { notificationEntity: Entity }) => {
      const { notificationEntity } = params;

      const now = new Date();

      await updateEntity({
        data: {
          entityId: notificationEntity.metadata.recordId.entityId,
          entityTypeId: notificationEntity.metadata.entityTypeId,
          properties: {
            ...notificationEntity.properties,
            "https://hash.ai/@hash/types/property-type/read-at/":
              now.toISOString(),
          } as NotificationProperties,
        },
      });

      await refetch();
    },
    [updateEntity, refetch],
  );

  const archiveNotification = useCallback(
    async (params: { notificationEntity: Entity }) => {
      const { notificationEntity } = params;

      await updateEntity({
        data: {
          entityId: notificationEntity.metadata.recordId.entityId,
          entityTypeId: notificationEntity.metadata.entityTypeId,
          properties: {
            ...notificationEntity.properties,
            "https://hash.ai/@hash/types/property-type/archived/": true,
          } as NotificationProperties,
        },
      });

      await refetch();
    },
    [updateEntity, refetch],
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
      refetch,
      markNotificationAsRead,
      archiveNotification,
    }),
    [
      notificationEntities,
      numberOfUnreadNotifications,
      loadingNotificationEntities,
      refetch,
      markNotificationAsRead,
      archiveNotification,
    ],
  );

  return (
    <NotificationEntitiesContext.Provider value={value}>
      {children}
    </NotificationEntitiesContext.Provider>
  );
};
