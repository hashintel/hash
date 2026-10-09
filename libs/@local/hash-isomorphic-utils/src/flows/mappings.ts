import type { FlowRun } from "../system-types/flowrun.js";
import type { LocalFlowRun } from "./types.js";

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
    "https://hash.ai/@h/types/property-type/flow-definition-id/": {
      value: flowRun.flowDefinitionId,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    "https://hash.ai/@h/types/property-type/workflow-id/": {
      value: flowRun.temporalWorkflowId,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    ...(flowRun.outputs
      ? {
          "https://hash.ai/@h/types/property-type/outputs/": {
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
    "https://hash.ai/@h/types/property-type/step/": {
      value: flowRun.steps.map((step) => ({
        value: step,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
        },
      })),
    },
    /**
     * The `Flow Run` entity type still requires a `Trigger`, from when flows had trigger definitions. Flows now
     * declare inputs instead, so the run's input values are recorded as the trigger's outputs. Nothing reads this
     * property back: the `Flow Run` type replaces it with an `Inputs` property in FE-1894.
     */
    "https://hash.ai/@h/types/property-type/trigger/": {
      value: {
        "https://hash.ai/@h/types/property-type/trigger-definition-id/": {
          value: "userTrigger",
          metadata: {
            dataTypeId:
              "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
          },
        },
        "https://hash.ai/@h/types/property-type/outputs/": {
          value: Object.entries(flowRun.flowInputs).map(
            ([inputName, payload]) => ({
              value: { outputName: inputName, payload },
              metadata: {
                dataTypeId:
                  "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
              },
            }),
          ),
        },
      },
    },
  },
});
