import { useLazyQuery, useMutation } from "@apollo/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
} from "../../../../graphql/queries/knowledge/entity.queries";
import { useActors } from "../../../../shared/use-actors";
import { useAuthInfo } from "../../../shared/auth-info-context";
import { isDwellType } from "../../shared/categories";
import { useScope } from "../../shared/scope-context";
import { STATUS_OPTIONS, statusKey } from "../../shared/status";
import {
  trackSupplyChainError,
  trackSupplyChainInteraction,
  trackSupplyChainStatusReportCreated,
} from "../../shared/telemetry";
import {
  byCreatedAt,
  deserializeSupplyChainUserPreferences,
  getStringArrayProperty,
  readItemArrayWithMetadata,
  readItemBaseUrl,
  supplyChainUserPreferencesQuery,
} from "../../shared/use-supply-chain-user-preferences";
import {
  applyReadOps,
  buildStatuses,
  mergeReadKeySets,
  type ReadOp,
} from "./read-state";

import type {
  CreateEntityMutation,
  CreateEntityMutationVariables,
  QueryEntitiesQuery,
  QueryEntitiesQueryVariables,
  UpdateEntityMutation,
  UpdateEntityMutationVariables,
} from "../../../../graphql/api-types.gen";
import type {
  StatusEntry,
  StatusOption,
  StatusStore,
} from "../../shared/status";
import type { SiteNode } from "../../shared/types";
import type {
  OpportunityStatusActions,
  OpportunityStatuses,
} from "./opportunities";
import type {
  ActorEntityUuid,
  BaseUrl,
  EntityId,
  PropertyObjectWithMetadata,
  WebId,
} from "@blockprotocol/type-system";
import type {
  OpportunityStatusUpdate,
  OpportunityStatusUpdatePropertiesWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/opportunitystatusupdate";
import type { SupplyChainUserPreferencesPropertiesWithMetadata } from "@local/hash-isomorphic-utils/system-types/supplychainuserpreferences";

/** A status report parsed from the graph before its author is resolved. */
interface RawStatusReport {
  key: string;
  /** ISO timestamp from the entity's creation edition. */
  at: string;
  category: StatusOption;
  text: string;
  /** Author resolved server-side from edition provenance. */
  authorId: ActorEntityUuid;
}

const scopeKeyBaseUrl = systemPropertyTypes.scopeKey.propertyTypeBaseUrl;
const siteCodeBaseUrl = systemPropertyTypes.siteCode.propertyTypeBaseUrl;
const statusCategoryBaseUrl =
  systemPropertyTypes.opportunityStatus.propertyTypeBaseUrl;
const statusTextBaseUrl =
  systemPropertyTypes.statusUpdateText.propertyTypeBaseUrl;

// Status reports and read markers intentionally use the generic generated
// system types plus the shared GraphQL entity mutations. There is no
// supply-chain-specific backend helper for this accepted model.

const textValueWithMetadata = (value: string) => ({
  value,
  metadata: { dataTypeId: blockProtocolDataTypes.text.dataTypeId },
});

const categoryValueWithMetadata = (value: StatusOption) => ({
  value,
  metadata: {
    dataTypeId: systemDataTypes.opportunityStatusCategory.dataTypeId,
  },
});

const getStringProperty = (
  entity: HashEntity,
  propertyBaseUrl: BaseUrl,
): string | undefined => {
  const raw = entity.properties[propertyBaseUrl];
  return typeof raw === "string" ? raw : undefined;
};

const toStatusOption = (value: string | undefined): StatusOption =>
  value && (STATUS_OPTIONS as readonly string[]).includes(value)
    ? (value as StatusOption)
    : "Investigation started";

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
      {
        equal: [
          { path: ["type", "baseUrl"] },
          {
            parameter:
              systemEntityTypes.opportunityStatusUpdate.entityTypeBaseUrl,
          },
        ],
      },
      {
        equal: [
          { path: ["properties", siteCodeBaseUrl] },
          { parameter: siteId },
        ],
      },
    ],
  },
  temporalAxes: currentTimeInstantTemporalAxes,
  includeDrafts: false,
  includePermissions: false,
});

const parseStatusReports = (entities: HashEntity[]): RawStatusReport[] => {
  const reports: RawStatusReport[] = [];

  for (const entity of entities) {
    const key = getStringProperty(entity, scopeKeyBaseUrl);
    if (!key) {
      continue;
    }

    reports.push({
      key,
      at: entity.metadata.provenance.createdAtDecisionTime,
      category: toStatusOption(
        getStringProperty(entity, statusCategoryBaseUrl),
      ),
      text: getStringProperty(entity, statusTextBaseUrl) ?? "",
      authorId: entity.metadata.provenance.edition.createdById,
    });
  }

  return reports;
};

export const useSupplyChainStatusState = (
  siteId: string,
): {
  actions: OpportunityStatusActions;
  statusHistory: StatusStore;
  statuses: OpportunityStatuses;
} => {
  const scope = useScope();
  const { authenticatedUser } = useAuthInfo();
  const userId = authenticatedUser?.accountId;
  const userWebId = authenticatedUser?.accountId as WebId | undefined;

  const [statusReports, setStatusReports] = useState<RawStatusReport[]>([]);
  const [readKeys, setReadKeys] = useState<string[]>([]);
  const [preferencesEntityId, setPreferencesEntityId] =
    useState<EntityId | null>(null);
  // Read/unread operations the user has made locally but that may not yet be
  // reflected in confirmed server state; drained by `flushReadKeys`.
  const pendingReadOpsRef = useRef(new Map<string, ReadOp>());
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

  const authorIds = useMemo(
    () => [...new Set(statusReports.map((report) => report.authorId))],
    [statusReports],
  );
  const { actors } = useActors({ accountIds: authorIds });

  const statusHistory = useMemo<StatusStore>(() => {
    const namesById = new Map(
      (actors ?? []).map((actor) => [actor.accountId, actor.displayName]),
    );
    const store: StatusStore = {};
    for (const report of statusReports) {
      const entry: StatusEntry = {
        at: report.at,
        category: report.category,
        text: report.text,
        user: namesById.get(report.authorId) ?? "Unknown user",
      };
      store[report.key] = [...(store[report.key] ?? []), entry];
    }
    for (const entries of Object.values(store)) {
      entries.sort((left, right) => left.at.localeCompare(right.at));
    }
    return store;
  }, [actors, statusReports]);

  const loadStatusReports = useCallback(async () => {
    if (!siteId) {
      setStatusReports([]);
      return;
    }

    const { data } = await queryEntities({
      variables: { request: statusReportQuery({ siteId, webId: scope }) },
    });

    setStatusReports(
      data?.queryEntities
        ? parseStatusReports(
            deserializeQueryEntitiesResponse(
              data.queryEntities as SerializedQueryEntitiesResponse<OpportunityStatusUpdate>,
            ).entities,
          )
        : [],
    );
  }, [queryEntities, scope, siteId]);

  /** Fetch the user's preferences entity (if any) along with its read keys. */
  const fetchPreferences = useCallback(async (): Promise<{
    entityId: EntityId | null;
    readKeys: string[];
  }> => {
    if (!userWebId) {
      return { entityId: null, readKeys: [] };
    }

    const { data } = await queryEntities({
      variables: {
        request: supplyChainUserPreferencesQuery({ webId: userWebId }),
      },
    });

    const preferencesEntities = deserializeSupplyChainUserPreferences(
      data?.queryEntities,
    );
    const [preferencesEntity] = [...preferencesEntities].sort(byCreatedAt);

    return {
      entityId: preferencesEntity?.metadata.recordId.entityId ?? null,
      readKeys: mergeReadKeySets(
        preferencesEntities.map((entity) =>
          getStringArrayProperty(entity, readItemBaseUrl),
        ),
      ),
    };
  }, [queryEntities, userWebId]);

  const loadPreferences = useCallback(async () => {
    const { entityId, readKeys: serverReadKeys } = await fetchPreferences();
    setPreferencesEntityId(entityId);
    // Preserve any local operations that haven't been confirmed server-side.
    setReadKeys(applyReadOps(serverReadKeys, pendingReadOpsRef.current));
  }, [fetchPreferences]);

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
    if (!userWebId) {
      throw new Error("Cannot save supply-chain preferences without a user.");
    }

    const properties = {
      value: {
        "https://hash.ai/@h/types/property-type/read-item/":
          readItemArrayWithMetadata([]),
      },
    } satisfies SupplyChainUserPreferencesPropertiesWithMetadata as PropertyObjectWithMetadata;

    const { data } = await createEntity({
      variables: {
        entityTypeIds: [
          systemEntityTypes.supplyChainUserPreferences.entityTypeId,
        ],
        webId: userWebId,
        properties,
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
  }, [createEntity, preferencesEntityId, userWebId]);

  // Drain pending read/unread operations onto the server with read-before-write
  // merge semantics: refetch the current keys, apply the pending ops, write the
  // merged list, and retry once on failure. Serialized via `writeQueueRef` so
  // rapid toggles coalesce into ordered writes.
  const flushReadKeys = useCallback(() => {
    if (!userId) {
      return;
    }
    writeQueueRef.current = writeQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (pendingReadOpsRef.current.size === 0) {
          return;
        }
        const ops = new Map(pendingReadOpsRef.current);
        pendingReadOpsRef.current.clear();

        const runAttempt = async () => {
          const entityId = await ensurePreferencesEntity();
          const { readKeys: serverReadKeys } = await fetchPreferences();
          const nextKeys = applyReadOps(serverReadKeys, ops);
          await updateEntity({
            variables: {
              entityUpdate: {
                entityId,
                propertyPatches: [
                  {
                    op: "add",
                    path: [readItemBaseUrl],
                    property: readItemArrayWithMetadata(nextKeys),
                  },
                ],
              },
            },
          });
        };

        try {
          await runAttempt();
        } catch {
          try {
            await runAttempt();
          } catch (error) {
            // Re-queue the failed ops so a later flush retries them, then
            // resync local state from the server.
            for (const [key, op] of ops) {
              if (!pendingReadOpsRef.current.has(key)) {
                pendingReadOpsRef.current.set(key, op);
              }
            }
            trackSupplyChainError({
              interaction: "read_markers_persist_failed",
              siteId,
              source: "opportunities_table",
            });
            void loadPreferences();
            throw error;
          }
        }
      });
  }, [
    ensurePreferencesEntity,
    fetchPreferences,
    loadPreferences,
    siteId,
    updateEntity,
    userId,
  ]);

  const onMarkRead = useCallback(
    (key: string) => {
      trackSupplyChainInteraction({
        interaction: "opportunity_marked_read",
        siteId,
        source: "opportunities_table",
      });
      pendingReadOpsRef.current.set(key, "add");
      setReadKeys((current) =>
        current.includes(key) ? current : [...current, key],
      );
      flushReadKeys();
    },
    [flushReadKeys, siteId],
  );

  const onMarkUnread = useCallback(
    (key: string) => {
      trackSupplyChainInteraction({
        interaction: "opportunity_marked_unread",
        siteId,
        source: "opportunities_table",
      });
      pendingReadOpsRef.current.set(key, "remove");
      setReadKeys((current) => current.filter((entry) => entry !== key));
      flushReadKeys();
    },
    [flushReadKeys, siteId],
  );

  const onSaveStatus = useCallback(
    (node: SiteNode, status: { category: StatusOption; text: string }) => {
      if (!userId) {
        return;
      }

      const key = statusKey(siteId, node);
      const opportunityType = isDwellType(node.type) ? "dwell" : "planning";
      trackSupplyChainStatusReportCreated({
        opportunityType,
        productId: node.products[0]?.id ?? "",
        siteId,
        source: "status_dialog",
        statusCategory: status.category,
        stepId: node.id,
      });

      // Optimistic: attribute to the current user; on reload the author is
      // re-derived from the entity's edition provenance.
      setStatusReports((current) => [
        ...current,
        {
          key,
          at: new Date().toISOString(),
          category: status.category,
          text: status.text,
          authorId: userId,
        },
      ]);

      const properties = {
        value: {
          "https://hash.ai/@h/types/property-type/scope-key/":
            textValueWithMetadata(key),
          "https://hash.ai/@h/types/property-type/site-code/":
            textValueWithMetadata(siteId),
          "https://hash.ai/@h/types/property-type/opportunity-status/":
            categoryValueWithMetadata(status.category),
          ...(status.text
            ? {
                "https://hash.ai/@h/types/property-type/status-update-text/":
                  textValueWithMetadata(status.text),
              }
            : {}),
        },
      } satisfies OpportunityStatusUpdatePropertiesWithMetadata as PropertyObjectWithMetadata;

      void createEntity({
        variables: {
          entityTypeIds: [
            systemEntityTypes.opportunityStatusUpdate.entityTypeId,
          ],
          webId: scope,
          properties,
        },
      })
        .then(() => loadStatusReports())
        .catch(() => {
          trackSupplyChainError({
            interaction: "status_report_create_failed",
            opportunityType,
            productId: node.products[0]?.id ?? "",
            siteId,
            source: "status_dialog",
            stepId: node.id,
          });
          void loadStatusReports();
        });
    },
    [createEntity, loadStatusReports, scope, siteId, userId],
  );

  const statuses = useMemo(() => buildStatuses(readKeys), [readKeys]);

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
