import type { FlowDefinition } from "./types";

/**
 * Validates a flow definition to ensure:
 * - Each node has a unique ID.
 * - Required inputs for each node are met and valid.
 * - Input sources (other node outputs, flow triggers, hardcoded values) exist and match expected types.
 *
 * @param flow The flow definition to validate.
 * @returns true if the flow definition passes all validation checks.
 */
export const validateFlowDefinition = (flow: FlowDefinition) => {
  const nodeIds = new Set<string>();
  for (const node of flow.nodes) {
    if (nodeIds.has(node.nodeId)) {
      throw new Error(`Duplicate node id: ${node.nodeId}`);
    }
    nodeIds.add(node.nodeId);

    const { definition, inputSources } = node;

    const requiredInputs = definition.inputs.filter(({ required }) => required);

    for (const requiredInput of requiredInputs) {
      const matchingInputSource = inputSources.find(
        (inputSource) => inputSource.inputName === requiredInput.name,
      );

      if (!matchingInputSource) {
        throw new Error(
          `Node "${node.nodeId}" is missing required input "${requiredInput.name}"`,
        );
      }
    }

    for (const inputSource of inputSources) {
      const matchingDefinitionInput = definition.inputs.find(
        (input) => input.name === inputSource.inputName,
      );

      if (!matchingDefinitionInput) {
        throw new Error(
          `Node "${node.nodeId}" has an input source for input "${inputSource.inputName}" that is not defined in its step definition`,
        );
      }

      const errorPrefix = `Node "${node.nodeId}" with input "${inputSource.inputName}" `;

      if (inputSource.kind === "step-output") {
        const sourceNode =
          inputSource.sourceNodeId === "trigger"
            ? flow.trigger
            : flow.nodes.find(
                ({ nodeId }) => nodeId === inputSource.sourceNodeId,
              );

        if (!sourceNode) {
          throw new Error(
            `${errorPrefix}references a source node "${inputSource.sourceNodeId}" that does not exist`,
          );
        }

        const sourceNodeOutputs = [
          ...(sourceNode.definition.outputs ?? []),
          /**
           * `outputs` may be defined on the source node itself as instead
           * of the definition, for example for a "User Trigger".
           */
          ...("outputs" in sourceNode && sourceNode.outputs
            ? sourceNode.outputs ?? []
            : []),
        ];

        const matchingSourceNodeOutput = sourceNodeOutputs.find(
          (output) => output.name === inputSource.sourceNodeOutputName,
        );

        if (!matchingSourceNodeOutput) {
          throw new Error(
            `${errorPrefix}references an output "${inputSource.sourceNodeOutputName}" of node "${inputSource.sourceNodeId}" that does not exist`,
          );
        }

        if (
          !matchingDefinitionInput.oneOfPayloadKinds.includes(
            matchingSourceNodeOutput.payloadKind,
          )
        ) {
          throw new Error(
            `${errorPrefix}references an output "${inputSource.sourceNodeOutputName}" of node "${inputSource.sourceNodeId}" that does not match the expected payload kinds of the input`,
          );
        }
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } else if (inputSource.kind === "hardcoded") {
        if (
          !matchingDefinitionInput.oneOfPayloadKinds.includes(
            inputSource.value.kind,
          )
        ) {
          throw new Error(
            `${errorPrefix}references a hardcoded value that does not match the expected payload kinds of the input`,
          );
        }
      }

      if ("fallbackValue" in inputSource && inputSource.fallbackValue) {
        if (
          !matchingDefinitionInput.oneOfPayloadKinds.includes(
            inputSource.fallbackValue.kind,
          )
        ) {
          throw new Error(
            `${errorPrefix}references a fallback value that does not match the expected payload kinds of the input`,
          );
        }
      }
    }
  }

  return true;
};
