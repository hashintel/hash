import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import {
  getOutgoingLinkAndTargetEntities,
  getRoots,
} from "@blockprotocol/graph/stdlib";
import {
  extractBaseUrl,
  extractEntityUuidFromEntityId,
  splitEntityId,
} from "@blockprotocol/type-system";
import { deserializeSubgraph } from "@local/hash-graph-sdk/subgraph";
import { currentTimeInstantTemporalAxes } from "@local/hash-isomorphic-utils/graph-queries";
import {
  systemEntityTypes,
  systemLinkEntityTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import {
  type Simplified,
  simplifyProperties,
} from "@local/hash-isomorphic-utils/simplify-properties";

import { queryEntitySubgraphQuery } from "../../graphql/queries/knowledge/entity.queries";
import {
  describeSchedule,
  getBrowserTimeZone,
  getTimeZoneCity,
  parseCronExpression,
} from "./schedule-repeat";

import type {
  QueryEntitySubgraphQuery,
  QueryEntitySubgraphQueryVariables,
} from "../../graphql/api-types.gen";
import type { ApolloError } from "@apollo/client";
import type { EntityRootType } from "@blockprotocol/graph";
import type { EntityId, EntityUuid } from "@blockprotocol/type-system";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type { ScheduleSpec } from "@local/hash-isomorphic-utils/flows/schedule-types";
import type { FlowDefinition } from "@local/hash-isomorphic-utils/system-types/flowdefinition";
import type { FlowSchedule } from "@local/hash-isomorphic-utils/system-types/flowschedule";

/** `name` is `null` when the user can't read the flow. */
export type ScheduledFlow = { entityId: EntityId; name: string | null };

type UseFlowSchedulesResult = {
  loading: boolean;
  error: ApolloError | undefined;
  refetch: () => Promise<unknown>;
  /** Whether the schedules have been fetched, so an empty map means there are none. */
  loaded: boolean;
  schedulesByEntityUuid: Map<EntityUuid, Simplified<HashEntity<FlowSchedule>>>;
  /** The flow each schedule starts, by the schedule's uuid: empty without `includeFlows`. */
  flowsByScheduleEntityUuid: Map<EntityUuid, ScheduledFlow>;
};

const formatIntervalMs = (ms: number): string => {
  const minutes = ms / (60 * 1000);
  if (minutes < 60) {
    return `Every ${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }

  const hours = minutes / 60;
  if (hours < 24) {
    return `Every ${hours} hour${hours !== 1 ? "s" : ""}`;
  }

  const days = hours / 24;
  return `Every ${days} day${days !== 1 ? "s" : ""}`;
};

/**
 * When a schedule runs, in words, e.g. "Every 10 minutes" or "Every Monday at 08:00", or its cron expression if it's
 * not one the trigger form makes. A cron's time zone, UTC unless it has one, follows it when it isn't the viewer's,
 * e.g. "Every Monday at 08:00 (New York)". `null` for the viewer's time zone leaves it out.
 */
export const formatScheduleSpec = (
  scheduleSpec: ScheduleSpec,
  viewerTimeZone: string | null = getBrowserTimeZone(),
): string => {
  if (scheduleSpec.type === "interval") {
    return formatIntervalMs(scheduleSpec.intervalMs);
  }

  const parsed = parseCronExpression(scheduleSpec.cronExpression);
  const text = parsed
    ? describeSchedule(parsed.rule, parsed.time)
    : `Cron: ${scheduleSpec.cronExpression}`;
  const timeZone = scheduleSpec.timezone ?? "UTC";

  return viewerTimeZone === null || timeZone === viewerTimeZone
    ? text
    : `${text} (${getTimeZoneCity(timeZone)})`;
};

/**
 * Hook to fetch the flow schedules visible to the current user: all of them, or only those of one flow.
 */
export const useFlowSchedules = ({
  flowDefinitionEntityId,
  includeFlows = false,
}: {
  /** The flow whose schedules to fetch, if only one flow's. */
  flowDefinitionEntityId?: EntityId;
  /** Also read the flow each schedule starts, e.g. for its name. */
  includeFlows?: boolean;
} = {}): UseFlowSchedulesResult => {
  const { data, loading, error, refetch } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          all: [
            {
              equal: [
                { path: ["type", "versionedUrl"] },
                { parameter: systemEntityTypes.flowSchedule.entityTypeId },
              ],
            },
            {
              equal: [{ path: ["archived"] }, { parameter: false }],
            },
            ...(flowDefinitionEntityId
              ? [
                  /* A schedule `Uses` the flow it runs. */
                  {
                    equal: [
                      { path: ["outgoingLinks", "rightEntity", "uuid"] },
                      {
                        parameter: extractEntityUuidFromEntityId(
                          flowDefinitionEntityId,
                        ),
                      },
                    ],
                  },
                ]
              : []),
          ],
        },
        graphResolveDepths: {
          constrainsValuesOn: 0,
          constrainsPropertiesOn: 0,
          constrainsLinksOn: 0,
          constrainsLinkDestinationsOn: 0,
          inheritsFrom: 0,
          isOfType: false,
        },
        /* A schedule `Uses` the flow it runs. */
        traversalPaths: includeFlows
          ? [
              {
                edges: [
                  { kind: "has-left-entity", direction: "incoming" },
                  { kind: "has-right-entity", direction: "outgoing" },
                ],
              },
            ]
          : [],
        temporalAxes: {
          pinned: {
            axis: "transactionTime",
            timestamp: null,
          },
          variable: {
            axis: "decisionTime",
            interval: {
              start: null,
              end: null,
            },
          },
        },
        includeDrafts: false,
        includePermissions: false,
      },
    },
    pollInterval: 10_000,
    fetchPolicy: "cache-and-network",
  });

  const { schedulesByEntityUuid, linkedFlows } = useMemo(() => {
    const byUuid = new Map<EntityUuid, Simplified<HashEntity<FlowSchedule>>>();
    const flowsByUuid = new Map<EntityUuid, ScheduledFlow>();

    if (!data) {
      return {
        schedulesByEntityUuid: byUuid,
        linkedFlows: flowsByUuid,
      };
    }

    const subgraph = deserializeSubgraph<
      EntityRootType<HashEntity<FlowSchedule>>
    >(data.queryEntitySubgraph.subgraph);

    const entities = getRoots(subgraph);

    for (const entity of entities) {
      const entityId = entity.metadata.recordId.entityId;
      const scheduleEntityUuid = extractEntityUuidFromEntityId(entityId);

      const schedule: Simplified<HashEntity<FlowSchedule>> = {
        metadata: entity.metadata,
        properties: simplifyProperties(entity.properties),
      };

      byUuid.set(scheduleEntityUuid, schedule);

      if (!includeFlows) {
        continue;
      }

      const usesLink = getOutgoingLinkAndTargetEntities(
        subgraph,
        entityId,
      ).find(({ linkEntity }) =>
        linkEntity[0]?.metadata.entityTypeIds.some(
          (entityTypeId) =>
            extractBaseUrl(entityTypeId) ===
            systemLinkEntityTypes.uses.linkEntityTypeBaseUrl,
        ),
      );
      const linkData = usesLink?.linkEntity[0]?.linkData;

      if (linkData) {
        /* The target is left out of the subgraph when it's archived, or the user can't read it. */
        const flow = usesLink.rightEntity?.[0] as
          | HashEntity<FlowDefinition>
          | undefined;

        flowsByUuid.set(scheduleEntityUuid, {
          entityId: linkData.rightEntityId,
          name: flow ? simplifyProperties(flow.properties).name : null,
        });
      }
    }

    return {
      schedulesByEntityUuid: byUuid,
      linkedFlows: flowsByUuid,
    };
  }, [data, includeFlows]);

  /* The traversal leaves archived flows out, but they can still be read by id. */
  const unnamedFlowEntityIds = useMemo(
    () => [
      ...new Set(
        Array.from(linkedFlows.values())
          .filter(({ name }) => name === null)
          .map(({ entityId }) => entityId),
      ),
    ],
    [linkedFlows],
  );

  const { data: unnamedFlowsData } = useQuery<
    QueryEntitySubgraphQuery,
    QueryEntitySubgraphQueryVariables
  >(queryEntitySubgraphQuery, {
    variables: {
      request: {
        filter: {
          any: unnamedFlowEntityIds.map((entityId) => {
            const [webId, entityUuid] = splitEntityId(entityId);

            return {
              all: [
                { equal: [{ path: ["webId"] }, { parameter: webId }] },
                { equal: [{ path: ["uuid"] }, { parameter: entityUuid }] },
              ],
            };
          }),
        },
        traversalPaths: [],
        temporalAxes: currentTimeInstantTemporalAxes,
        includeDrafts: false,
        includePermissions: false,
      },
    },
    skip: unnamedFlowEntityIds.length === 0,
  });

  const flowsByScheduleEntityUuid = useMemo(() => {
    if (!unnamedFlowsData) {
      return linkedFlows;
    }

    const namesByEntityId = new Map(
      getRoots(
        deserializeSubgraph<EntityRootType<HashEntity<FlowDefinition>>>(
          unnamedFlowsData.queryEntitySubgraph.subgraph,
        ),
      ).map((flow) => [
        flow.metadata.recordId.entityId,
        simplifyProperties(flow.properties).name,
      ]),
    );

    return new Map(
      Array.from(linkedFlows, ([scheduleUuid, flow]) => [
        scheduleUuid,
        {
          ...flow,
          name: flow.name ?? namesByEntityId.get(flow.entityId) ?? null,
        },
      ]),
    );
  }, [linkedFlows, unnamedFlowsData]);

  return {
    loading,
    error,
    refetch,
    loaded: data !== undefined,
    schedulesByEntityUuid,
    flowsByScheduleEntityUuid,
  };
};
