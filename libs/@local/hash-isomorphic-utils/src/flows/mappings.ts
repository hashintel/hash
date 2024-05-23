import type { Entity, EntityUuid } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";

import { simplifyProperties } from "../simplify-properties";
import type { FlowDefinitionProperties } from "../system-types/flowdefinition";
import type { FlowRunProperties } from "../system-types/flowrun";
import type { TriggerDefinitionId } from "./trigger-definitions";
import type { FlowDefinition, LocalFlowRun, OutputDefinition } from "./types";

export const mapFlowDefinitionToEntityProperties = (
  flowDefinition: FlowDefinition,
): FlowDefinitionProperties => ({
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
  entity: Entity<FlowDefinitionProperties>,
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
): FlowRunProperties => ({
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
    flowRun.name,
  "https://hash.ai/@hash/types/property-type/flow-definition-id/":
    flowRun.flowDefinitionId,
  "https://hash.ai/@hash/types/property-type/outputs/": flowRun.outputs,
  "https://hash.ai/@hash/types/property-type/step/": flowRun.steps,
  "https://hash.ai/@hash/types/property-type/trigger/": {
    "https://hash.ai/@hash/types/property-type/trigger-definition-id/":
      flowRun.trigger.triggerDefinitionId,
  },
});

export const mapFlowEntityToFlow = (
  entity: Entity<FlowRunProperties>,
): LocalFlowRun => {
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
