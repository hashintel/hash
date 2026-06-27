import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  deserializeQueryEntitiesResponse,
  HashEntity,
} from "@local/hash-graph-sdk/entity";
import {
  currentTimeInstantTemporalAxes,
  generateVersionedUrlMatchingFilter,
} from "@local/hash-isomorphic-utils/graph-queries";
import { blockProtocolPropertyTypes } from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createEntityMutation,
  queryEntitiesQuery,
  updateEntityMutation,
} from "../../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../../shared/auth-info-context";
import { useScope } from "../../shared/scope-context";
import {
  datetimeDataTypeId,
  objectDataTypeId,
  supplyChainPropertyBaseUrls,
  supplyChainStatusReportEntityTypeId,
  supplyChainUserPreferencesEntityTypeId,
  textDataTypeId,
} from "../../shared/status-graph-types";
import {
  trackSupplyChainError,
  trackSupplyChainInteraction,
  trackSupplyChainStatusReportCreated,
} from "../../shared/telemetry";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import type {
  OpportunityStatusActions,
  OpportunityStatuses,
  StatusOption,
  StatusStore,
} from "./opportunities";
import type {
  BaseUrl,
  Entity,
  EntityId,
  WebId,
} from "@blockprotocol/type-system";

type ReadMarker = {
  key: string;
  readAt: string;
};

const textProperty = (value: string) => ({
  value,
  metadata: { dataTypeId: textDataTypeId },
});

const datetimeProperty = (value: string) => ({
  value,
  metadata: { dataTypeId: datetimeDataTypeId },
});

const objectArrayProperty = (value: ReadMarker[]) => ({
  value,
  metadata: { dataTypeId: objectDataTypeId },
});

const getPropertyValue = <T>(
  entity: Entity,
  propertyBaseUrl: BaseUrl,
): T | undefined => {
  const raw = entity.properties[propertyBaseUrl] as unknown;
  if (raw && typeof raw === "object" && "value" in raw) {
    return (raw as { value: T }).value;
  }
  return raw as T | undefined;
};

const statusReportQuery = ({
  siteId,
  webId,
}: {
  siteId: string;
  webId: WebId;
}) => ({
  filter: {
    all: [
      { equal: [{ path: ["webId"] }, { parameter: webId }] },
      generateVersionedUrlMatchingFilter(supplyChainStatusReportEntityTypeId, {
        ignoreParents: false,
      }),
      {
        equal: [
          { path: ["properties", supplyChainPropertyBaseUrls.siteId] },
          { parameter: siteId },
        ],
      },
    ],
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeDrafts: false,
  includePermissions: false,
});

const preferencesQuery = ({
  userId,
  webId,
}: {
  userId: string;
  webId: WebId;
}) => ({
  filter: {
    all: [
      { equal: [{ path: ["webId"] }, { parameter: webId }] },
      generateVersionedUrlMatchingFilter(
        supplyChainUserPreferencesEntityTypeId,
        {
          ignoreParents: false,
        },
      ),
      {
        equal: [
          {
            path: ["properties", supplyChainPropertyBaseUrls.preferencesUserId],
          },
          { parameter: userId },
        ],
      },
      {
        equal: [
          {
            path: ["properties", supplyChainPropertyBaseUrls.preferencesWebId],
          },
          { parameter: webId },
        ],
      },
    ],
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeDrafts: false,
  includePermissions: false,
});

const buildStatuses = (readMarkers: ReadMarker[]): OpportunityStatuses =>
  Object.fromEntries(
    readMarkers.map((marker) => [
      marker.key,
      { read: true, readAt: marker.readAt },
    ]),
  );

const parseStatusReports = (entities: Entity[]): StatusStore => {
  const store: StatusStore = {};

  for (const entity of entities) {
    const key = getPropertyValue<string>(
      entity,
      supplyChainPropertyBaseUrls.scopeKey,
    );
    if (!key) {
      continue;
    }

    const entry = {
      at:
        getPropertyValue<string>(
          entity,
          supplyChainPropertyBaseUrls.statusReportCreatedAt,
        ) ?? new Date().toISOString(),
      category:
        getPropertyValue<StatusOption>(
          entity,
          supplyChainPropertyBaseUrls.statusCategory,
        ) ?? "Investigation started",
      text:
        getPropertyValue<string>(
          entity,
          supplyChainPropertyBaseUrls.statusText,
        ) ?? "",
      user:
        getPropertyValue<string>(
          entity,
          supplyChainPropertyBaseUrls.statusReportAuthorId,
        ) ?? "Unknown user",
    };

    store[key] = [...(store[key] ?? []), entry];
  }

  for (const entries of Object.values(store)) {
    entries.sort((left, right) => left.at.localeCompare(right.at));
  }

  return store;
};

const parseStatusKey = (key: string) => {
  const [siteId = "", opportunityType = "", nodeKey = ""] = key.split("::");
  const [stepId = "", productIds = ""] = nodeKey.split("-");
  const [productId = ""] = productIds.split(",");
  return { opportunityType, productId, siteId, stepId };
};

export const useSupplyChainStatusState = (
  siteId: string,
): {
  actions: OpportunityStatusActions;
  statusHistory: StatusStore;
  statuses: OpportunityStatuses;
} => {
  const scope = useScope() as WebId;
  const { authenticatedUser } = useAuthInfo();
  const userId = authenticatedUser?.accountId;
  const userLabel =
    authenticatedUser?.displayName ?? authenticatedUser?.shortname ?? userId;

  const [statusHistory, setStatusHistory] = useState<StatusStore>({});
  const [readMarkers, setReadMarkers] = useState<ReadMarker[]>([]);
  const [preferencesEntityId, setPreferencesEntityId] =
    useState<EntityId | null>(null);
  const writeQueueRef = useRef(Promise.resolve());

  const [queryEntities] = useLazyQuery<
    QueryEntitiesQuery,
    QueryEntitiesQueryVariables
  >(queryEntitiesQuery, { fetchPolicy: "network-only" });
  const [createEntity] = useMutation<
    CreateEntityMutation,
    CreateEntityMutationVariables
  >(createEntityMutation);
  const [updateEntity] = useMutation<
    UpdateEntityMutation,
    UpdateEntityMutationVariables
  >(updateEntityMutation);

  const loadStatusReports = useCallback(async () => {
    if (!siteId) {
      setStatusHistory({});
      return;
    }

    const { data } = await queryEntities({
      variables: { request: statusReportQuery({ siteId, webId: scope }) },
    });

    setStatusHistory(
      data?.queryEntities
        ? parseStatusReports(
            deserializeQueryEntitiesResponse(data.queryEntities).entities,
          )
        : {},
    );
  }, [queryEntities, scope, siteId]);

  const loadPreferences = useCallback(async () => {
    if (!userId) {
      setPreferencesEntityId(null);
      setReadMarkers([]);
      return;
    }

    const { data } = await queryEntities({
      variables: {
        request: preferencesQuery({ userId, webId: scope }),
      },
    });

    const preferencesEntity = data?.queryEntities
      ? deserializeQueryEntitiesResponse(data.queryEntities).entities[0]
      : undefined;

    setPreferencesEntityId(
      preferencesEntity?.metadata.recordId.entityId ?? null,
    );
    setReadMarkers(
      preferencesEntity
        ? (getPropertyValue<ReadMarker[]>(
            preferencesEntity,
            supplyChainPropertyBaseUrls.readMarkers,
          ) ?? [])
        : [],
    );
  }, [queryEntities, scope, userId]);

  useEffect(() => {
    void loadStatusReports();
  }, [loadStatusReports]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const ensurePreferencesEntity = useCallback(async (): Promise<EntityId> => {
    if (preferencesEntityId) {
      return preferencesEntityId;
    }
    if (!userId) {
      throw new Error("Cannot save supply-chain preferences without a user.");
    }

    const { data } = await createEntity({
      variables: {
        entityTypeIds: [supplyChainUserPreferencesEntityTypeId],
        webId: scope,
        properties: {
          [blockProtocolPropertyTypes.name.propertyTypeBaseUrl]: textProperty(
            `Supply-chain preferences for ${userId}`,
          ),
          [supplyChainPropertyBaseUrls.preferencesUserId]: textProperty(userId),
          [supplyChainPropertyBaseUrls.preferencesWebId]: textProperty(scope),
          [supplyChainPropertyBaseUrls.readMarkers]: objectArrayProperty([]),
        } as unknown as CreateEntityMutationVariables["properties"],
      },
    });

    const entityId = data?.createEntity
      ? new HashEntity(data.createEntity).metadata.recordId.entityId
      : undefined;
    if (!entityId) {
      throw new Error("Failed to create supply-chain preferences.");
    }
    setPreferencesEntityId(entityId);
    return entityId;
  }, [createEntity, preferencesEntityId, scope, userId]);

  const persistReadMarkers = useCallback(
    (nextMarkers: ReadMarker[]) => {
      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const entityId = await ensurePreferencesEntity();
          await updateEntity({
            variables: {
              entityUpdate: {
                entityId,
                propertyPatches: [
                  {
                    op: "add",
                    path: [supplyChainPropertyBaseUrls.readMarkers],
                    property: objectArrayProperty(nextMarkers),
                  },
                ],
              },
            },
          });
        });
    },
    [ensurePreferencesEntity, updateEntity],
  );

  const onMarkRead = useCallback(
    (key: string) => {
      const readAt = new Date().toISOString();
      trackSupplyChainInteraction({
        interaction: "opportunity_marked_read",
        siteId,
        source: "opportunities_table",
      });
      setReadMarkers((currentMarkers) => {
        const nextMarkers = [
          ...currentMarkers.filter((marker) => marker.key !== key),
          { key, readAt },
        ];
        persistReadMarkers(nextMarkers);
        return nextMarkers;
      });
    },
    [persistReadMarkers, siteId],
  );

  const onMarkUnread = useCallback(
    (key: string) => {
      trackSupplyChainInteraction({
        interaction: "opportunity_marked_unread",
        siteId,
        source: "opportunities_table",
      });
      setReadMarkers((currentMarkers) => {
        const nextMarkers = currentMarkers.filter(
          (marker) => marker.key !== key,
        );
        persistReadMarkers(nextMarkers);
        return nextMarkers;
      });
    },
    [persistReadMarkers, siteId],
  );

  const onSaveStatus = useCallback(
    (key: string, status: { category: StatusOption; text: string }) => {
      if (!userId) {
        return;
      }

      const createdAt = new Date().toISOString();
      const parsedKey = parseStatusKey(key);
      trackSupplyChainStatusReportCreated({
        opportunityType: parsedKey.opportunityType,
        productId: parsedKey.productId,
        siteId: parsedKey.siteId || siteId,
        source: "status_dialog",
        stepId: parsedKey.stepId,
      });
      const entry = {
        at: createdAt,
        category: status.category,
        text: status.text,
        user: userLabel ?? userId,
      };

      setStatusHistory((currentHistory) => ({
        ...currentHistory,
        [key]: [...(currentHistory[key] ?? []), entry],
      }));

      void createEntity({
        variables: {
          entityTypeIds: [supplyChainStatusReportEntityTypeId],
          webId: scope,
          properties: {
            [supplyChainPropertyBaseUrls.scopeKey]: textProperty(key),
            [supplyChainPropertyBaseUrls.productId]: textProperty(
              parsedKey.productId,
            ),
            [supplyChainPropertyBaseUrls.siteId]: textProperty(
              parsedKey.siteId || siteId,
            ),
            [supplyChainPropertyBaseUrls.stepId]: textProperty(
              parsedKey.stepId,
            ),
            [supplyChainPropertyBaseUrls.opportunityType]: textProperty(
              parsedKey.opportunityType,
            ),
            [supplyChainPropertyBaseUrls.statusCategory]: textProperty(
              status.category,
            ),
            [supplyChainPropertyBaseUrls.statusText]: textProperty(status.text),
            [supplyChainPropertyBaseUrls.statusReportAuthorId]: textProperty(
              userLabel ?? userId,
            ),
            [supplyChainPropertyBaseUrls.statusReportCreatedAt]:
              datetimeProperty(createdAt),
          } as unknown as CreateEntityMutationVariables["properties"],
        },
      }).catch(() => {
        trackSupplyChainError({
          interaction: "status_report_create_failed",
          opportunityType: parsedKey.opportunityType,
          productId: parsedKey.productId,
          siteId: parsedKey.siteId || siteId,
          source: "status_dialog",
          stepId: parsedKey.stepId,
        });
        void loadStatusReports();
      });
    },
    [createEntity, loadStatusReports, scope, siteId, userId, userLabel],
  );

  const statuses = useMemo(() => buildStatuses(readMarkers), [readMarkers]);

  return {
    actions: {
      onMarkRead,
      onMarkUnread,
      onSaveStatus,
    },
    statusHistory,
    statuses,
  };
};
