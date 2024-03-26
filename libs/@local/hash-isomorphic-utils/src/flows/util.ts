/* eslint-disable @typescript-eslint/no-unnecessary-condition */
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

  const flowNodesWithNestedNodes = [
    ...flow.nodes,
    ...flow.nodes.flatMap((node) =>
      node.kind === "parallel-group" ? node.nodes : [],
    ),
  ];

  for (const node of flowNodesWithNestedNodes) {
    if (nodeIds.has(node.nodeId)) {
      throw new Error(`Duplicate node id: ${node.nodeId}`);
    }
    nodeIds.add(node.nodeId);

    if (node.kind === "parallel-group") {
      const { inputSourceToParallelizeOn } = node;

      const errorPrefix = `Parallel group node "${node.nodeId}" `;

      if (inputSourceToParallelizeOn.kind === "node-output") {
        const { sourceNodeId, sourceNodeOutputName } =
          inputSourceToParallelizeOn;
        const sourceNode =
          sourceNodeId === "trigger"
            ? flow.trigger
            : flowNodesWithNestedNodes.find(
                ({ nodeId }) => nodeId === sourceNodeId,
              );

        if (!sourceNode) {
          throw new Error(
            `${errorPrefix}references a source node "${sourceNodeId}" that does not exist`,
          );
        }

        const sourceNodeOutputs = [
          ...(sourceNode.kind === "action"
            ? sourceNode.actionDefinition.outputs
            : []),
          ...(sourceNode.kind === "trigger"
            ? [
                ...(sourceNode.definition.outputs ?? []),
                ...(sourceNode.outputs ?? []),
              ]
            : []),
          ...(sourceNode.kind === "parallel-group"
            ? [sourceNode.aggregateOutput]
            : []),
        ];

        const matchingSourceNodeOutput = sourceNodeOutputs.find(
          (output) => output.name === sourceNodeOutputName,
        );

        if (!matchingSourceNodeOutput) {
          throw new Error(
            `${errorPrefix}parallelizes on an output "${sourceNodeOutputName}" of node "${sourceNodeId}" that does not exist`,
          );
        }

        if (!matchingSourceNodeOutput.array) {
          throw new Error(
            `${errorPrefix}parallelizes an output "${sourceNodeOutputName}" of node "${sourceNodeId}" that is not an array`,
          );
        }

        const { nodes: childNodes } = node;

        for (const childActionNode of childNodes) {
          for (const childActionInputSource of childActionNode.inputSources) {
            if (childActionInputSource.kind === "parallel-group-input") {
              const { actionDefinition } = childActionNode;

              const matchingDefinitionInput = actionDefinition.inputs.find(
                (input) => input.name === childActionInputSource.inputName,
              );

              if (!matchingDefinitionInput) {
                throw new Error(
                  `Action node "${childActionNode.nodeId}" in parallel group "${node.nodeId}" has an input source for input "${childActionInputSource.inputName}" that is not defined in its action definition`,
                );
              }

              if (matchingDefinitionInput.array) {
                throw new Error(
                  `Action node "${childActionNode.nodeId}" in parallel group "${node.nodeId}" references an input "${childActionInputSource.inputName}" that is an array`,
                );
              }

              if (
                !matchingDefinitionInput.oneOfPayloadKinds.includes(
                  matchingSourceNodeOutput.payloadKind,
                )
              ) {
                throw new Error(
                  `Action node "${childActionNode.nodeId}" in parallel group "${node.nodeId}" references an output "${sourceNodeOutputName}" of node "${sourceNodeId}" that does not match the expected payload kinds of the input`,
                );
              }
            }
          }
        }
      } else if (inputSourceToParallelizeOn.kind === "hardcoded") {
        /**
         * Note we don't need to validate whether the hardcoded value is an array,
         * because this is enforced via the types.
         */
      }

      const { aggregateOutput } = node;

      const childNodeUsedForAggregateOutput = node.nodes.find(
        (childNode) => childNode.nodeId === aggregateOutput.nodeId,
      );

      if (!childNodeUsedForAggregateOutput) {
        throw new Error(
          `${errorPrefix}references an aggregate output source node "${aggregateOutput.nodeId}" that does not exist in is child nodes`,
        );
      }

      const childNodeOutput =
        childNodeUsedForAggregateOutput.actionDefinition.outputs.find(
          (output) => output.name === aggregateOutput.nodeOutputName,
        );

      if (!childNodeOutput) {
        throw new Error(
          `${errorPrefix}references an aggregate output source node output "${aggregateOutput.nodeOutputName}" that does not exist in its child node`,
        );
      }

      if (childNodeOutput.array) {
        throw new Error(
          `${errorPrefix}references an aggregate output source node output "${aggregateOutput.nodeOutputName}" that is an array`,
        );
      }
    } else if (node.kind === "action") {
      const { actionDefinition, inputSources } = node;

      const requiredInputs = actionDefinition.inputs.filter(
        ({ required }) => required,
      );

      for (const requiredInput of requiredInputs) {
        const matchingInputSource = inputSources.find(
          (inputSource) => inputSource.inputName === requiredInput.name,
        );

        if (!matchingInputSource) {
          throw new Error(
            `Action node "${node.nodeId}" is missing required input "${requiredInput.name}"`,
          );
        }
      }

      for (const inputSource of inputSources) {
        const matchingDefinitionInput = actionDefinition.inputs.find(
          (input) => input.name === inputSource.inputName,
        );

        if (!matchingDefinitionInput) {
          throw new Error(
            `Action node "${node.nodeId}" has an input source for input "${inputSource.inputName}" that is not defined in its action definition`,
          );
        }

        const errorPrefix = `Action node "${node.nodeId}" with input "${inputSource.inputName}" `;

        if (inputSource.kind === "node-output") {
          const { sourceNodeId } = inputSource;

          const sourceNode =
            sourceNodeId === "trigger"
              ? flow.trigger
              : flowNodesWithNestedNodes.find(
                  ({ nodeId }) => nodeId === sourceNodeId,
                );

          if (!sourceNode) {
            throw new Error(
              `${errorPrefix}references a source node "${sourceNodeId}" that does not exist`,
            );
          }

          const sourceNodeOutputs = [
            ...(sourceNode.kind === "action"
              ? sourceNode.actionDefinition.outputs
              : []),
            ...(sourceNode.kind === "trigger"
              ? [
                  ...(sourceNode.definition.outputs ?? []),
                  ...(sourceNode.outputs ?? []),
                ]
              : []),
            ...(sourceNode.kind === "parallel-group"
              ? [sourceNode.aggregateOutput]
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
  }

  return true;
};
