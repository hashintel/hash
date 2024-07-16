import type { Entity } from "@local/hash-graph-sdk/entity";
import type { EntityUuid } from "@local/hash-graph-types/entity";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";

import { simplifyProperties } from "../simplify-properties.js";
import type { FlowDefinition as FlowDefinitionEntity } from "../system-types/flowdefinition.js";
import type { FlowRun } from "../system-types/flowrun.js";
import type { TriggerDefinitionId } from "./trigger-definitions.js";
import type {
  FlowDefinition,
  LocalFlowRun,
  OutputDefinition,
} from "./types.js";

export const mapFlowDefinitionToEntityProperties = (
  flowDefinition: FlowDefinition,
): FlowDefinitionEntity["properties"] => ({
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
    flowDefinition.name,
  "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
    flowDefinition.description,
  "https://hash.ai/@hash/types/property-type/output-definitions/":
    flowDefinition.outputs,
  "https://hash.ai/@hash/types/property-type/step-definitions/":
    flowDefinition.steps,
  "https://hash.ai/@hash/types/property-type/trigger-definition/": {
    "https://hash.ai/@hash/types/property-type/trigger-definition-id/":
      flowDefinition.trigger.triggerDefinitionId,
    "https://hash.ai/@hash/types/property-type/output-definitions/":
      flowDefinition.trigger.outputs,
  },
});

export const mapFlowDefinitionEntityToFlowDefinition = (
  entity: Entity<FlowDefinitionEntity>,
): FlowDefinition => {
  const {
    name,
    description,
    outputDefinitions,
    stepDefinitions,
    triggerDefinition,
  } = simplifyProperties(entity.properties);

  return {
    name,
    description,
    flowDefinitionId: extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    ),
    outputs: outputDefinitions as FlowDefinition["outputs"],
    steps: stepDefinitions as FlowDefinition["steps"],
    trigger: {
      kind: "trigger",
      triggerDefinitionId:
        triggerDefinition[
          "https://hash.ai/@hash/types/property-type/trigger-definition-id/"
        ],
      outputs: triggerDefinition[
        "https://hash.ai/@hash/types/property-type/output-definitions/"
      ] as OutputDefinition<boolean>[],
      /** @todo: fix this */
    } as unknown as FlowDefinition["trigger"],
  };
};

export const mapFlowRunToEntityProperties = (
  flowRun: LocalFlowRun,
): FlowRun["propertiesWithMetadata"] => ({
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
      value: flowRun.name,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    "https://hash.ai/@hash/types/property-type/flow-definition-id/": {
      value: flowRun.flowDefinitionId,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    ...(flowRun.outputs
      ? {
          "https://hash.ai/@hash/types/property-type/outputs/": {
            value: flowRun.outputs.map((output) => ({
              value: output,
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            })),
          },
        }
      : {}),
    "https://hash.ai/@hash/types/property-type/step/": {
      value: flowRun.steps.map((step) => ({
        value: step,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      })),
    },
    "https://hash.ai/@hash/types/property-type/trigger/": {
      value: {
        "https://hash.ai/@hash/types/property-type/trigger-definition-id/": {
          value: flowRun.trigger.triggerDefinitionId,
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
        ...(flowRun.trigger.outputs
          ? {
              "https://hash.ai/@hash/types/property-type/outputs/": {
                value: flowRun.trigger.outputs.map((output) => ({
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
  },
});

export const mapFlowEntityToFlow = (entity: Entity<FlowRun>): LocalFlowRun => {
  const {
    name,
    flowDefinitionId,
    outputs,
    step: steps,
    trigger,
  } = simplifyProperties(entity.properties);

  return {
    name,
    flowRunId: extractEntityUuidFromEntityId(entity.metadata.recordId.entityId),
    flowDefinitionId: flowDefinitionId as EntityUuid,
    outputs: outputs as LocalFlowRun["outputs"],
    steps: steps as LocalFlowRun["steps"],
    trigger: {
      triggerDefinitionId: trigger[
        "https://hash.ai/@hash/types/property-type/trigger-definition-id/"
      ] as TriggerDefinitionId,
      outputs: trigger[
        "https://hash.ai/@hash/types/property-type/outputs/"
      ] as LocalFlowRun["trigger"]["outputs"],
    },
  };
};
