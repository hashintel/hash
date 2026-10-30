import { simplifyProperties } from "../simplify-properties.js";
import { assertValidFlowDefinition } from "./validate-flow-definition.js";

import type {
  FlowDefinition as FlowDefinitionEntity,
  FlowDefinitionPropertiesWithMetadata,
} from "../system-types/flowdefinition.js";
import type { FlowRun } from "../system-types/flowrun.js";
import type {
  ExternalInputRequest,
  FlowDefinition,
  FlowInputValues,
  LocalFlowRun,
  Payload,
} from "./types.js";
import type { HashEntity } from "@local/hash-graph-sdk/entity";

const toObjectArrayProperty = (values: object[]) => ({
  value: values.map((value) => ({
    value,
    metadata: {
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1" as const,
    },
  })),
});

/**
 * The properties of the `Flow Definition` entity that holds a flow definition. Typed against the generated entity
 * type, so that the two can't drift apart.
 */
export const mapFlowDefinitionToEntityProperties = (
  flowDefinition: FlowDefinition,
): FlowDefinitionPropertiesWithMetadata => ({
  value: {
    "https://blockprotocol.org/@blockprotocol/types/property-type/name/": {
      value: flowDefinition.name,
      metadata: {
        dataTypeId:
          "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
      },
    },
    "https://blockprotocol.org/@blockprotocol/types/property-type/description/":
      {
        value: flowDefinition.description,
        metadata: {
          dataTypeId:
            "https://blockprotocol.org/@blockprotocol/types/data-type/text/v/1",
        },
      },
    "https://hash.ai/@h/types/property-type/input-definition/":
      toObjectArrayProperty(flowDefinition.inputs),
    "https://hash.ai/@h/types/property-type/step-definition/":
      toObjectArrayProperty(flowDefinition.steps),
    "https://hash.ai/@h/types/property-type/output-definition/":
      toObjectArrayProperty(flowDefinition.outputs),
  },
});

/**
 * What a `Flow Definition` entity holds, in the shape of a flow definition, without checking that it is a valid
 * one: e.g. to compare it with a definition, as it was written.
 */
export const getUnvalidatedFlowDefinitionFromEntity = (
  entity: HashEntity<FlowDefinitionEntity>,
) => {
  const {
    name,
    description,
    inputDefinition,
    stepDefinition,
    outputDefinition,
  } = simplifyProperties(entity.properties);

  return {
    name,
    description,
    inputs: inputDefinition,
    steps: stepDefinition,
    outputs: outputDefinition,
  };
};

/**
 * The flow definition a `Flow Definition` entity holds.
 *
 * @throws if the entity's definition is invalid, listing every problem.
 */
export const getFlowDefinitionFromEntity = (
  entity: HashEntity<FlowDefinitionEntity>,
): FlowDefinition =>
  assertValidFlowDefinition(getUnvalidatedFlowDefinitionFromEntity(entity));

/**
 * The `Open Input Request` property of a flow run: the requests it has made that haven't been answered yet.
 */
export const mapOpenInputRequestsToEntityProperty = (
  openInputRequests: ExternalInputRequest[],
): NonNullable<
  FlowRun["propertiesWithMetadata"]["value"]["https://hash.ai/@h/types/property-type/open-input-request/"]
> => toObjectArrayProperty(openInputRequests);

/**
 * The `Inputs` property of a flow run or trigger: one `{ inputName, payload }` object per input given a value,
 * like the `Outputs` property.
 */
export const mapFlowInputValuesToInputsProperty = (
  flowInputs: FlowInputValues,
): FlowRun["propertiesWithMetadata"]["value"]["https://hash.ai/@h/types/property-type/inputs/"] => ({
  value: Object.entries(flowInputs).map(([inputName, payload]) => ({
    value: { inputName, payload },
    metadata: {
      dataTypeId:
        "https://blockprotocol.org/@blockprotocol/types/data-type/object/v/1",
    },
  })),
});

/** The values given to a flow's inputs, from the `Inputs` property of a flow run or trigger. */
export const mapInputsPropertyToFlowInputValues = (
  inputs: FlowRun["properties"]["https://hash.ai/@h/types/property-type/inputs/"],
): FlowInputValues =>
  Object.fromEntries(
    (inputs as { inputName: string; payload: Payload }[]).map(
      ({ inputName, payload }) => [inputName, payload],
    ),
  );

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
    "https://hash.ai/@h/types/property-type/inputs/":
      mapFlowInputValuesToInputsProperty(flowRun.flowInputs),
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
  },
});
