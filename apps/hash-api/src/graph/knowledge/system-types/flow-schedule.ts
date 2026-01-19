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
  SchedulePauseStatePropertyValue,
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
    flowDefinitionId,
    flowType,
    webId,
    scheduleSpec,
    overlapPolicy = defaultScheduleOverlapPolicy,
    catchupWindowMs = defaultScheduleCatchupWindowMs,
    pauseOnFailure = defaultSchedulePauseOnFailure,
    dataSources,
    flowTrigger,
  } = params;

  /**
   * Note: Using 'any' for properties because the generated types don't include
   * flowDefinitionId yet (needs codegen to be run after migration).
   * @todo remove 'any' cast after running codegen
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const properties: any = {
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
      ...(pauseOnFailure !== defaultSchedulePauseOnFailure
        ? {
            "https://hash.ai/@h/types/property-type/pause-on-failure/": {
              value: pauseOnFailure,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/boolean/v/1",
              },
            },
          }
        : {}),
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
  UpdateFlowScheduleInput,
  Promise<HashEntity<FlowSchedule>>,
  false,
  true
> = async (context, authentication, params) => {
  const { scheduleEntityId, ...updates } = params;

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
  { scheduleEntityId: EntityId; note?: string },
  Promise<HashEntity<FlowSchedule>>,
  false,
  true
> = async (context, authentication, params) => {
  const { scheduleEntityId, note } = params;

  const existingEntity = await getFlowScheduleById(context, authentication, {
    scheduleEntityId,
  });

  const pauseState: SchedulePauseStatePropertyValue = {
    "https://hash.ai/@h/types/property-type/paused-at/":
      new Date().toISOString(),
    ...(note
      ? { "https://hash.ai/@h/types/property-type/explanation/": note }
      : {}),
  };

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
          },
        },
        {
          op: "add",
          path: [systemPropertyTypes.schedulePauseState.propertyTypeBaseUrl],
          property: {
            value: pauseState,
            metadata: {
              dataTypeId:
                "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
            },
          },
        },
      ],
    },
  );

  return updatedEntity;
};

export const resumeFlowSchedule: ImpureGraphFunction<
  { scheduleEntityId: EntityId },
  Promise<HashEntity<FlowSchedule>>,
  false,
  true
> = async (context, authentication, params) => {
  const { scheduleEntityId } = params;

  const existingEntity = await getFlowScheduleById(context, authentication, {
    scheduleEntityId,
  });

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
    },
  );

  return updatedEntity;
};
