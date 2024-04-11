import type { Entity, EntityUuid } from "@local/hash-subgraph";
import { extractEntityUuidFromEntityId } from "@local/hash-subgraph";

import { simplifyProperties } from "../simplify-properties";
import type { FlowProperties } from "../system-types/flow";
import type { FlowDefinitionProperties } from "../system-types/flowdefinition";
import type { TriggerDefinitionId } from "./trigger-definitions";
import type { Flow, FlowDefinition, OutputDefinition } from "./types";

export const mapFlowDefinitionToEntityProperties = (
  flowDefinition: FlowDefinition,
): FlowDefinitionProperties => ({
  "https://blockprotocol.org/@blockprotocol/types/property-type/name/":
    flowDefinition.name,
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
  const { name, outputDefinitions, stepDefinitions, triggerDefinition } =
    simplifyProperties(entity.properties);

  return {
    name,
    flowDefinitionId: extractEntityUuidFromEntityId(
      entity.metadata.recordId.entityId,
    ),
    outputs: outputDefinitions as FlowDefinition["outputs"],
    steps: stepDefinitions as FlowDefinition["steps"],
    trigger: {
      kind: "trigger",
      triggerDefinitionId: triggerDefinition[
        "https://hash.ai/@hash/types/property-type/trigger-definition-id/"
      ] as TriggerDefinitionId,
      outputs: triggerDefinition[
        "https://hash.ai/@hash/types/property-type/output-definitions/"
      ] as OutputDefinition<boolean>[],
      /** @todo: fix this */
    } as unknown as FlowDefinition["trigger"],
  };
};

export const mapFlowToEntityProperties = (flow: Flow): FlowProperties => ({
  "https://hash.ai/@hash/types/property-type/flow-definition-id/":
    flow.flowDefinitionId,
  "https://hash.ai/@hash/types/property-type/outputs/": flow.outputs,
  "https://hash.ai/@hash/types/property-type/step/": flow.steps,
  "https://hash.ai/@hash/types/property-type/trigger/": {
    "https://hash.ai/@hash/types/property-type/trigger-definition-id/":
      flow.trigger.triggerDefinitionId,
  },
});

export const mapFlowEntityToFlow = (entity: Entity<FlowProperties>): Flow => {
  const {
    flowDefinitionId,
    outputs,
    step: steps,
    trigger,
  } = simplifyProperties(entity.properties);

  return {
    flowId: extractEntityUuidFromEntityId(entity.metadata.recordId.entityId),
    flowDefinitionId: flowDefinitionId as EntityUuid,
    outputs: outputs as Flow["outputs"],
    steps: steps as Flow["steps"],
    trigger: {
      triggerDefinitionId: trigger[
        "https://hash.ai/@hash/types/property-type/trigger-definition-id/"
      ] as TriggerDefinitionId,
      outputs: trigger[
        "https://hash.ai/@hash/types/property-type/outputs/"
      ] as Flow["trigger"]["outputs"],
    },
  };
};
