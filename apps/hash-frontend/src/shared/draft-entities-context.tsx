import { useMutation, useQuery } from "@apollo/client";
import {
  currentTimeInstantTemporalAxes,
  mapGqlSubgraphFieldsFragmentToSubgraph,
  zeroedGraphResolveDepths,
} from "@local/hash-isomorphic-utils/graph-queries";
import { Entity, EntityRootType, Subgraph } from "@local/hash-subgraph/.";
import { getRoots } from "@local/hash-subgraph/stdlib";
import {
  createContext,
  FunctionComponent,
  PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import {
  ArchiveEntityMutation,
  ArchiveEntityMutationVariables,
  StructuralQueryEntitiesQuery,
  StructuralQueryEntitiesQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../graphql/api-types.gen";
import {
  archiveEntityMutation,
  structuralQueryEntitiesQuery,
  updateEntityMutation,
} from "../graphql/queries/knowledge/entity.queries";
import { useNotifications } from "./notifications-context";

const getDraftEntitiesQueryVariables: StructuralQueryEntitiesQueryVariables = {
  query: {
    filter: {
      all: [
        {
          equal: [{ path: ["draft"] }, { parameter: true }],
        },
        {
          equal: [{ path: ["archived"] }, { parameter: false }],
        },
      ],
    },
    temporalAxes: currentTimeInstantTemporalAxes,
    graphResolveDepths: {
      ...zeroedGraphResolveDepths,
      isOfType: { outgoing: 1 },
      inheritsFrom: { outgoing: 255 },
      constrainsPropertiesOn: { outgoing: 255 },
      constrainsValuesOn: { outgoing: 255 },
      hasLeftEntity: { outgoing: 1, incoming: 1 },
      hasRightEntity: { outgoing: 1, incoming: 1 },
    },
    includeDrafts: true,
  },
  includePermissions: false,
};

export type DraftEntitiesContextValue = {
  draftEntities?: Entity[];
  draftEntitiesSubgraph?: Subgraph<EntityRootType>;
  loading: boolean;
  refetch: () => Promise<void>;
  discardDraftEntity: (params: { draftEntity: Entity }) => Promise<void>;
  acceptDraftEntity: (params: { draftEntity: Entity }) => Promise<Entity>;
};

export const DraftEntitiesContext =
  createContext<null | DraftEntitiesContextValue>(null);

export const useDraftEntities = () => {
  const draftEntitiesContext = useContext(DraftEntitiesContext);

  if (!draftEntitiesContext) {
    throw new Error("Context missing");
  }

  return draftEntitiesContext;
};

const draftEntitiesPollingInterval = 10_000;

export const DraftEntitiesContextProvider: FunctionComponent<
  PropsWithChildren
> = ({ children }) => {
  const [
    previouslyFetchedDraftEntitiesData,
    setPreviouslyFetchedDraftEntitiesData,
  ] = useState<StructuralQueryEntitiesQuery>();

  const {
    data: draftEntitiesData,
    refetch,
    loading,
  } = useQuery<
    StructuralQueryEntitiesQuery,
    StructuralQueryEntitiesQueryVariables
  >(structuralQueryEntitiesQuery, {
    variables: getDraftEntitiesQueryVariables,
    onCompleted: (data) => setPreviouslyFetchedDraftEntitiesData(data),
    pollInterval: draftEntitiesPollingInterval,
  });

  const draftEntitiesSubgraph = useMemo(
    () =>
      draftEntitiesData || previouslyFetchedDraftEntitiesData
        ? mapGqlSubgraphFieldsFragmentToSubgraph<EntityRootType>(
            (draftEntitiesData ?? previouslyFetchedDraftEntitiesData)!
              .structuralQueryEntities.subgraph,
          )
        : undefined,
    [draftEntitiesData, previouslyFetchedDraftEntitiesData],
  );

  const draftEntities = useMemo(
    () => (draftEntitiesSubgraph ? getRoots(draftEntitiesSubgraph) : undefined),
    [draftEntitiesSubgraph],
  );

  const { notifications, archiveNotification, markNotificationAsRead } =
    useNotifications();

  const archiveRelatedNotifications = useCallback(
    async (params: { draftEntity: Entity }) => {
      const relatedNotifications = notifications?.filter(
        (notification) =>
          notification.occurredInEntity.metadata.recordId.entityId ===
          params.draftEntity.metadata.recordId.entityId,
      );

      if (!relatedNotifications) {
        return;
      }

      await Promise.all(
        relatedNotifications.map((notification) => {
          return archiveNotification({
            notificationEntityId:
              notification.entity.metadata.recordId.entityId,
          });
        }),
      );
    },
    [notifications, archiveNotification],
  );

  const [archiveEntity] = useMutation<
    ArchiveEntityMutation,
    ArchiveEntityMutationVariables
  >(archiveEntityMutation);

  const discardDraftEntity = useCallback(
    async (params: { draftEntity: Entity }) => {
      await archiveRelatedNotifications(params);

      await archiveEntity({
        variables: {
          entityId: params.draftEntity.metadata.recordId.entityId,
        },
      });

      await refetch();
    },
    [archiveEntity, archiveRelatedNotifications, refetch],
  );

  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const markRelatedGraphChangeNotificationsAsRead = useCallback(
    async (params: { draftEntity: Entity }) => {
      const relatedGraphChangeNotifications =
        notifications?.filter(
          ({ kind, occurredInEntity }) =>
            kind === "graph-change" &&
            occurredInEntity.metadata.recordId.entityId ===
              params.draftEntity.metadata.recordId.entityId,
        ) ?? [];

      await Promise.all(
        relatedGraphChangeNotifications.map((notification) =>
          markNotificationAsRead({ notification }),
        ),
      );
    },
    [notifications, markNotificationAsRead],
  );

  const acceptDraftEntity = useCallback(
    async (params: { draftEntity: Entity }) => {
      await markRelatedGraphChangeNotificationsAsRead(params);

      const response = await updateEntity({
        variables: {
          entityId: params.draftEntity.metadata.recordId.entityId,
          updatedProperties: params.draftEntity.properties,
          draft: false,
        },
      });

      await refetch();

      if (!response.data) {
        throw new Error("An error occurred accepting the draft entity.");
      }

      return response.data.updateEntity;
    },
    [updateEntity, refetch, markRelatedGraphChangeNotificationsAsRead],
  );

  const value = useMemo<DraftEntitiesContextValue>(
    () => ({
      draftEntities,
      draftEntitiesSubgraph,
      loading,
      refetch: async () => {
        await refetch();
      },
      discardDraftEntity,
      acceptDraftEntity,
    }),
    [
      draftEntities,
      draftEntitiesSubgraph,
      loading,
      refetch,
      discardDraftEntity,
      acceptDraftEntity,
    ],
  );

  return (
    <DraftEntitiesContext.Provider value={value}>
      {children}
    </DraftEntitiesContext.Provider>
  );
};
