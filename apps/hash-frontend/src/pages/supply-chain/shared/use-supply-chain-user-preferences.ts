import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  deserializeQueryEntitiesResponse,
  HashEntity,
  type SerializedQueryEntitiesResponse,
} from "@local/hash-graph-sdk/entity";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  blockProtocolDataTypes,
  systemDataTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";

import {
  createEntityMutation,
  queryEntitiesQuery,
  updateEntityMutation,
} from "../../../graphql/queries/knowledge/entity.queries";
import { useAuthInfo } from "../../shared/auth-info-context";
import { rangeMonths, type TimeRange } from "./time-range";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../graphql/api-types.gen";
import type {
  BaseUrl,
  EntityId,
  PropertyObjectWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import type { SupplyChainUserPreferences } from "@local/hash-isomorphic-utils/system-types/supplychainuserpreferences";

export interface SupplyChainPreferenceSettings {
  excludeLowSamples?: boolean;
  excludeOutliers?: boolean;
  timeRange?: TimeRange;
}

export const readItemBaseUrl = systemPropertyTypes.readItem.propertyTypeBaseUrl;
export const excludeLowSamplesBaseUrl =
  systemPropertyTypes.excludeLowSamples.propertyTypeBaseUrl;
export const excludeOutliersBaseUrl =
  systemPropertyTypes.excludeOutliers.propertyTypeBaseUrl;
export const timePeriodBaseUrl =
  systemPropertyTypes.timePeriod.propertyTypeBaseUrl;

export const byCreatedAt = (left: HashEntity, right: HashEntity) =>
  left.metadata.provenance.createdAtDecisionTime.localeCompare(
    right.metadata.provenance.createdAtDecisionTime,
  );

export const supplyChainUserPreferencesQuery = ({
  webId,
}: {
  webId: WebId;
}) => ({
  filter: {
    all: [
      { equal: [{ path: ["webId"] }, { parameter: webId }] },
      {
        equal: [
          { path: ["type", "baseUrl"] },
          {
            parameter:
              systemEntityTypes.supplyChainUserPreferences.entityTypeBaseUrl,
          },
        ],
      },
    ],
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeDrafts: false,
  includePermissions: false,
});

export const deserializeSupplyChainUserPreferences = (
  response: QueryEntitiesQuery["queryEntities"] | null | undefined,
) =>
  response
    ? deserializeQueryEntitiesResponse(
        response as SerializedQueryEntitiesResponse<SupplyChainUserPreferences>,
      ).entities
    : [];

export const getBooleanProperty = (
  entity: HashEntity,
  propertyBaseUrl: BaseUrl,
): boolean | undefined => {
  const raw = entity.properties[propertyBaseUrl];
  return typeof raw === "boolean" ? raw : undefined;
};

export const getNumberProperty = (
  entity: HashEntity,
  propertyBaseUrl: BaseUrl,
): number | undefined => {
  const raw = entity.properties[propertyBaseUrl];
  return typeof raw === "number" ? raw : undefined;
};

export const getStringArrayProperty = (
  entity: HashEntity,
  propertyBaseUrl: BaseUrl,
): string[] => {
  const raw = entity.properties[propertyBaseUrl];
  return Array.isArray(raw)
    ? raw.flatMap((value) => (typeof value === "string" ? [value] : []))
    : [];
};

export const readItemArrayWithMetadata = (keys: string[]) => ({
  value: keys.map((key) => ({
    value: key,
    metadata: { dataTypeId: blockProtocolDataTypes.text.dataTypeId },
  })),
});

const booleanValueWithMetadata = (value: boolean) => ({
  value,
  metadata: { dataTypeId: blockProtocolDataTypes.boolean.dataTypeId },
});

const monthValueWithMetadata = (value: number) => ({
  value,
  metadata: { dataTypeId: systemDataTypes.month.dataTypeId },
});

const timeRangeFromMonths = (months: number | undefined) => {
  if (months === 3 || months === 6 || months === 12) {
    return `${months}m` as TimeRange;
  }
  return undefined;
};

const settingsFromPreferencesEntity = (
  entity: HashEntity | undefined,
): SupplyChainPreferenceSettings => ({
  excludeLowSamples: entity
    ? getBooleanProperty(entity, excludeLowSamplesBaseUrl)
    : undefined,
  excludeOutliers: entity
    ? getBooleanProperty(entity, excludeOutliersBaseUrl)
    : undefined,
  timeRange: entity
    ? timeRangeFromMonths(getNumberProperty(entity, timePeriodBaseUrl))
    : undefined,
});

const emptyPreferencesProperties = {
  value: {
    "https://hash.ai/@h/types/property-type/read-item/":
      readItemArrayWithMetadata([]),
  },
} as PropertyObjectWithMetadata;

export const useSupplyChainUserPreferences = () => {
  const { authenticatedUser } = useAuthInfo();
  const userWebId = authenticatedUser?.accountId as WebId | undefined;
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<SupplyChainPreferenceSettings>({});
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

  const fetchPreferences = useCallback(async () => {
    if (!userWebId) {
      return {
        entityId: null,
        settings: {},
      };
    }

    const { data } = await queryEntities({
      variables: {
        request: supplyChainUserPreferencesQuery({ webId: userWebId }),
      },
    });

    const [preferencesEntity] = [
      ...deserializeSupplyChainUserPreferences(data?.queryEntities),
    ].sort(byCreatedAt);

    return {
      entityId: preferencesEntity?.metadata.recordId.entityId ?? null,
      settings: settingsFromPreferencesEntity(preferencesEntity),
    };
  }, [queryEntities, userWebId]);

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    try {
      const { entityId, settings: loadedSettings } = await fetchPreferences();
      setPreferencesEntityId(entityId);
      setSettings(loadedSettings);
    } catch {
      setPreferencesEntityId(null);
      setSettings({});
    } finally {
      setLoading(false);
    }
  }, [fetchPreferences]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const ensurePreferencesEntity = useCallback(async (): Promise<EntityId> => {
    if (preferencesEntityId) {
      return preferencesEntityId;
    }
    if (!userWebId) {
      throw new Error("Cannot save supply-chain preferences without a user.");
    }

    const { entityId } = await fetchPreferences();
    if (entityId) {
      setPreferencesEntityId(entityId);
      return entityId;
    }

    const { data } = await createEntity({
      variables: {
        entityTypeIds: [
          systemEntityTypes.supplyChainUserPreferences.entityTypeId,
        ],
        webId: userWebId,
        properties: emptyPreferencesProperties,
      },
    });

    const createdEntityId = data?.createEntity
      ? new HashEntity(data.createEntity).metadata.recordId.entityId
      : undefined;
    if (!createdEntityId) {
      throw new Error("Failed to create supply-chain preferences.");
    }
    setPreferencesEntityId(createdEntityId);
    return createdEntityId;
  }, [createEntity, fetchPreferences, preferencesEntityId, userWebId]);

  const saveSettings = useCallback(
    (nextSettings: SupplyChainPreferenceSettings) => {
      setSettings((currentSettings) => ({
        ...currentSettings,
        ...nextSettings,
      }));

      if (!userWebId) {
        return;
      }

      writeQueueRef.current = writeQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          const propertyPatches = [];

          if (typeof nextSettings.excludeLowSamples === "boolean") {
            propertyPatches.push({
              op: "add" as const,
              path: [excludeLowSamplesBaseUrl],
              property: booleanValueWithMetadata(
                nextSettings.excludeLowSamples,
              ),
            });
          }

          if (typeof nextSettings.excludeOutliers === "boolean") {
            propertyPatches.push({
              op: "add" as const,
              path: [excludeOutliersBaseUrl],
              property: booleanValueWithMetadata(nextSettings.excludeOutliers),
            });
          }

          if (nextSettings.timeRange) {
            propertyPatches.push({
              op: "add" as const,
              path: [timePeriodBaseUrl],
              property: monthValueWithMetadata(
                rangeMonths(nextSettings.timeRange),
              ),
            });
          }

          if (propertyPatches.length === 0) {
            return;
          }

          const entityId = await ensurePreferencesEntity();
          await updateEntity({
            variables: {
              entityUpdate: {
                entityId,
                propertyPatches,
              },
            },
          });
        });
    },
    [ensurePreferencesEntity, updateEntity, userWebId],
  );

  return {
    loading,
    settings,
    saveSettings,
  };
};
