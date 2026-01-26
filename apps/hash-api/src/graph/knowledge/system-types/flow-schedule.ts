import type { EntityId } from "@blockprotocol/type-system";
import { EntityTypeMismatchError } from "@local/hash-backend-utils/error";
import type { HashEntity } from "@local/hash-graph-sdk/entity";
import type {
  CreateFlowScheduleInput,
  UpdateFlowScheduleInput,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import {
  defaultScheduleCatchupWindowMs,
  defaultScheduleOverlapPolicy,
  defaultSchedulePauseOnFailure,
} from "@local/hash-isomorphic-utils/flows/schedule-types";
import {
  blockProtocolPropertyTypes,
  systemEntityTypes,
  systemPropertyTypes,
} from "@local/hash-isomorphic-utils/ontology-type-ids";
import type {
  FlowSchedule,
  FlowSchedulePropertiesWithMetadata,
  SchedulePauseStatePropertyValueWithMetadata,
  ScheduleStatusPropertyValueWithMetadata,
} from "@local/hash-isomorphic-utils/system-types/shared";

import type { ImpureGraphFunction } from "../../context-types";
import {
  createEntity,
  getLatestEntityById,
  updateEntity,
} from "../primitive/entity";

const isEntityFlowScheduleEntity = (
  entity: HashEntity,
): entity is HashEntity<FlowSchedule> =>
  entity.metadata.entityTypeIds.includes(
    systemEntityTypes.flowSchedule.entityTypeId,
  );

export const createFlowSchedule: ImpureGraphFunction<
  CreateFlowScheduleInput,
  Promise<HashEntity<FlowSchedule>>
> = async (context, authentication, params) => {
  const {
    name,
    flowDefinition,
    webId,
    scheduleSpec,
    overlapPolicy = defaultScheduleOverlapPolicy,
    catchupWindowMs = defaultScheduleCatchupWindowMs,
    pauseOnFailure = defaultSchedulePauseOnFailure,
    dataSources,
    flowTrigger,
  } = params;

  const { flowDefinitionId, type: flowType } = flowDefinition;

  const properties: FlowSchedulePropertiesWithMetadata = {
    value: {
      "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
        value: name,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/flow-definition-id/": {
        value: flowDefinitionId,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/flow-type/": {
        value: flowType,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/flow-type/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/schedule-spec/": {
        value: scheduleSpec,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/schedule-overlap-policy/": {
        value: overlapPolicy,
        metadata: {
          dataTypeId:
            "https://hash.ai/@h/types/data-type/schedule-overlap-policy/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/schedule-status/": {
        value: "active",
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/schedule-status/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/trigger/": {
        value: {
          "https://hash.ai/@h/types/property-type/trigger-definition-id/": {
            value: flowTrigger.triggerDefinitionId,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
            },
          },
          ...(flowTrigger.outputs
            ? {
                "https://hash.ai/@h/types/property-type/outputs/": {
                  value: flowTrigger.outputs.map((output) => ({
                    value: output,
                    metadata: {
                      dataTypeId:
                        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
                    },
                  })),
                },
              }
            : {}),
        },
      },
      "https://hash.ai/@h/types/property-type/schedule-catchup-window/": {
        value: catchupWindowMs,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/millisecond/v/1",
        },
      },
      "https://hash.ai/@h/types/property-type/pause-on-failure/": {
        value: pauseOnFailure,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
        },
      },
      ...(dataSources
        ? {
            "https://hash.ai/@h/types/property-type/data-sources/": {
              value: dataSources,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            },
          }
        : {}),
    },
  };

  const entity = await createEntity<FlowSchedule>(context, authentication, {
    webId,
    properties,
    entityTypeIds: [systemEntityTypes.flowSchedule.entityTypeId],
  });

  return entity;
};

export const getFlowScheduleById: ImpureGraphFunction<
  { scheduleEntityId: EntityId },
  Promise<HashEntity<FlowSchedule>>
> = async (context, authentication, { scheduleEntityId }) => {
  const entity = await getLatestEntityById(context, authentication, {
    entityId: scheduleEntityId,
  });

  if (!isEntityFlowScheduleEntity(entity)) {
    throw new EntityTypeMismatchError(
      entity.metadata.recordId.entityId,
      systemEntityTypes.flowSchedule.entityTypeId,
      entity.metadata.entityTypeIds,
    );
  }

  return entity;
};

export const updateFlowSchedule: ImpureGraphFunction<
  { scheduleEntityId: EntityId; input: UpdateFlowScheduleInput },
  Promise<HashEntity<FlowSchedule>>,
  false,
  true
> = async (context, authentication, params) => {
  const { scheduleEntityId, input: updates } = params;

  const existingEntity = await getFlowScheduleById(context, authentication, {
    scheduleEntityId,
  });

  const propertyPatches: Parameters<typeof updateEntity>[2]["propertyPatches"] =
    [];

  if (updates.name !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [blockProtocolPropertyTypes.name.propertyTypeBaseUrl],
      property: {
        value: updates.name,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    });
  }

  if (updates.scheduleSpec !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [systemPropertyTypes.scheduleSpec.propertyTypeBaseUrl],
      property: {
        value: updates.scheduleSpec,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    });
  }

  if (updates.overlapPolicy !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [systemPropertyTypes.scheduleOverlapPolicy.propertyTypeBaseUrl],
      property: {
        value: updates.overlapPolicy,
        metadata: {
          dataTypeId:
            "https://hash.ai/@h/types/data-type/schedule-overlap-policy/v/1",
        },
      },
    });
  }

  if (updates.catchupWindowMs !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [systemPropertyTypes.scheduleCatchupWindow.propertyTypeBaseUrl],
      property: {
        value: updates.catchupWindowMs,
        metadata: {
          dataTypeId: "https://hash.ai/@h/types/data-type/millisecond/v/1",
        },
      },
    });
  }

  if (updates.pauseOnFailure !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [systemPropertyTypes.pauseOnFailure.propertyTypeBaseUrl],
      property: {
        value: updates.pauseOnFailure,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
        },
      },
    });
  }

  if (updates.dataSources !== undefined) {
    propertyPatches.push({
      op: "replace",
      path: [systemPropertyTypes.dataSources.propertyTypeBaseUrl],
      property: {
        value: updates.dataSources,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    });
  }

  if (propertyPatches.length === 0) {
    return existingEntity;
  }

  const updatedEntity = await updateEntity<FlowSchedule>(
    context,
    authentication,
    {
      entity: existingEntity,
      propertyPatches,
    },
  );

  return updatedEntity;
};

export const pauseFlowSchedule: ImpureGraphFunction<
  { existingEntity: HashEntity<FlowSchedule>; note?: string },
  Promise<HashEntity<FlowSchedule>>,
  false,
  true
> = async (context, authentication, { existingEntity, note }) => {
  const updatedEntity = await updateEntity<FlowSchedule>(
    context,
    authentication,
    {
      entity: existingEntity,
      propertyPatches: [
        {
          op: "replace",
          path: [systemPropertyTypes.scheduleStatus.propertyTypeBaseUrl],
          property: {
            value: "paused",
            metadata: {
              dataTypeId:
                "https://hash.ai/@h/types/data-type/schedule-status/v/1",
            },
          } satisfies ScheduleStatusPropertyValueWithMetadata,
        },
        {
          op: "add",
          path: [systemPropertyTypes.schedulePauseState.propertyTypeBaseUrl],
          property: {
            value: {
              "https://hash.ai/@h/types/property-type/paused-at/": {
                value: new Date().toISOString(),
                metadata: {
                  dataTypeId: "https://hash.ai/@h/types/data-type/datetime/v/1",
                },
              },
              ...(note
                ? {
                    "https://hash.ai/@h/types/property-type/explanation/": {
                      value: note,
                      metadata: {
                        dataTypeId:
                          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
                      },
                    },
                  }
                : {}),
            },
          } satisfies SchedulePauseStatePropertyValueWithMetadata,
        },
      ],
    },
  );

  return updatedEntity;
};

export const resumeFlowSchedule: ImpureGraphFunction<
  {
    existingEntity: HashEntity<FlowSchedule>;
    hasSchedulePauseState: boolean;
  },
  Promise<HashEntity<FlowSchedule>>,
  false,
  true
> = async (
  context,
  authentication,
  { existingEntity, hasSchedulePauseState },
) => {
  const propertyPatches: Parameters<typeof updateEntity>[2]["propertyPatches"] =
    [
      {
        op: "replace",
        path: [systemPropertyTypes.scheduleStatus.propertyTypeBaseUrl],
        property: {
          value: "active",
          metadata: {
            dataTypeId:
              "https://hash.ai/@h/types/data-type/schedule-status/v/1",
          },
        },
      },
    ];

  if (hasSchedulePauseState) {
    propertyPatches.push({
      op: "remove",
      path: [systemPropertyTypes.schedulePauseState.propertyTypeBaseUrl],
    });
  }

  const updatedEntity = await updateEntity<FlowSchedule>(
    context,
    authentication,
    {
      entity: existingEntity,
      propertyPatches,
    },
  );

  return updatedEntity;
};

/**
 * Reverts a pause operation by setting the schedule back to active.
 * Used when Temporal operations fail after the entity has been updated.
 */
export const revertFlowSchedulePause: ImpureGraphFunction<
  { pausedEntity: HashEntity<FlowSchedule> },
  Promise<void>,
  false,
  true
> = async (context, authentication, { pausedEntity }) => {
  await updateEntity<FlowSchedule>(context, authentication, {
    entity: pausedEntity,
    propertyPatches: [
      {
        op: "replace",
        path: [systemPropertyTypes.scheduleStatus.propertyTypeBaseUrl],
        property: {
          value: "active",
          metadata: {
            dataTypeId:
              "https://hash.ai/@h/types/data-type/schedule-status/v/1",
          },
        },
      },
      {
        op: "remove",
        path: [systemPropertyTypes.schedulePauseState.propertyTypeBaseUrl],
      },
    ],
  });
};

/**
 * Reverts a resume operation by setting the schedule back to paused.
 * Used when Temporal operations fail after the entity has been updated.
 */
export const revertFlowScheduleResume: ImpureGraphFunction<
  {
    resumedEntity: HashEntity<FlowSchedule>;
    previousPauseState: FlowSchedule["properties"]["https://hash.ai/@h/types/property-type/schedule-pause-state/"];
  },
  Promise<void>,
  false,
  true
> = async (context, authentication, { resumedEntity, previousPauseState }) => {
  const propertyPatches: Parameters<typeof updateEntity>[2]["propertyPatches"] =
    [
      {
        op: "replace",
        path: [systemPropertyTypes.scheduleStatus.propertyTypeBaseUrl],
        property: {
          value: "paused",
          metadata: {
            dataTypeId:
              "https://hash.ai/@h/types/data-type/schedule-status/v/1",
          },
        } satisfies ScheduleStatusPropertyValueWithMetadata,
      },
    ];

  // Only restore schedulePauseState if it existed before
  if (previousPauseState !== undefined) {
    propertyPatches.push({
      op: "add",
      path: [systemPropertyTypes.schedulePauseState.propertyTypeBaseUrl],
      property: {
        value: previousPauseState,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      },
    });
  }

  await updateEntity<FlowSchedule>(context, authentication, {
    entity: resumedEntity,
    propertyPatches,
  });
};
