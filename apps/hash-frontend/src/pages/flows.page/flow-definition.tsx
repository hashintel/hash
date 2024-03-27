import "reactflow/dist/style.css";

import type { Label } from "@dagrejs/dagre";
import Dagre from "@dagrejs/dagre";
import { Box } from "@mui/material";
import { BackgroundVariant } from "@reactflow/background";
import { useLayoutEffect, useMemo } from "react";
import type { Edge, Node } from "reactflow";
import ReactFlow, { Background, Controls, useReactFlow } from "reactflow";

import { CustomNode } from "./flow-definition/custom-node";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import type { NodeData } from "./flow-definition/shared/types";

const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const nodeTypes = {
  action: CustomNode,
  "parallel-group": CustomNode,
  trigger: CustomNode,
};

export const FlowDefinition = () => {
  const { fitView } = useReactFlow();

  const { flowDefinitions, selectedFlow, setSelectedFlow } =
    useFlowDefinitionsContext();

  const { nodes, edges } = useMemo<{
    nodes: Node<NodeData>[];
    edges: Edge[];
  }>(() => {
    const derivedNodes: Node<NodeData>[] = [
      {
        id: "trigger",
        data: {
          label: selectedFlow.trigger.definition.name,
          stepDefinition: {
            ...selectedFlow.trigger.definition,
            outputs:
              selectedFlow.trigger.outputs ??
              selectedFlow.trigger.definition.outputs,
          },
          inputSources: [],
        },
        type: "trigger",
        position: { x: 0, y: 0 },
        height: 100,
        width: 200,
      },
    ];

    derivedNodes.push(
      ...selectedFlow.steps.flatMap((node) => {
        const rootNode = {
          id: node.stepId,
          data: {
            stepDefinition:
              node.kind === "action" ? node.actionDefinition : null,
            label:
              node.kind === "action"
                ? node.actionDefinition.name
                : "UNLABELLED",
            inputSources:
              node.kind === "parallel-group"
                ? [node.inputSourceToParallelizeOn]
                : node.inputSources,
          },
          type: node.kind,
          position: { x: 0, y: 0 },
          height: 100,
          width: 200,
        };

        const stepNodes: Node<NodeData>[] = [rootNode];

        if (node.kind === "parallel-group") {
          stepNodes.push(
            ...node.steps.map((step) => ({
              id: step.stepId,
              data: {
                stepDefinition: step.actionDefinition,
                label: step.actionDefinition.name,
                inputSources: step.inputSources,
              },
              type: "action",
              parentNode: rootNode.id,
              extent: "parent" as const,
              position: { x: 0, y: 0 },
              height: 100,
              width: 200,
            })),
          );
        }

        return stepNodes;
      }),
    );

    const derivedEdges: Edge[] = [];
    for (const node of derivedNodes) {
      for (const inputSource of node.data.inputSources) {
        if (inputSource.kind === "step-output") {
          derivedEdges.push({
            id: `${inputSource.sourceStepId}-${node.id}`,
            source: inputSource.sourceStepId,
            sourceHandle: inputSource.sourceStepOutputName,
            target: node.id,
            targetHandle: inputSource.inputName,
          });
        }
      }
    }

    graph.setGraph({ rankdir: "LR" });

    for (const edge of derivedEdges) {
      graph.setEdge(edge.source, edge.target);
    }
    for (const node of derivedNodes) {
      graph.setNode(node.id, node as Label);
    }

    Dagre.layout(graph);

    return {
      nodes: derivedNodes.map((node) => {
        const { x, y } = graph.node(node.id);

        return {
          ...node,
          position: { x, y },
        };
      }),
      edges: derivedEdges,
    };
  }, [selectedFlow]);

  useLayoutEffect(() => {
    fitView();
  });

  console.log({ edges });

  return (
    <div style={{ width: "100%", height: "calc(100vh - 200px)" }}>
      <Box mb={2}>
        <select
          value={selectedFlow.name}
          onChange={(event) =>
            setSelectedFlow(
              flowDefinitions.find((def) => def.name === event.target.value)!,
            )
          }
        >
          {flowDefinitions.map((flow) => (
            <option key={flow.name} value={flow.name}>
              {flow.name}
            </option>
          ))}
        </select>
      </Box>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={edges}
        fitView
        // onNodesChange={onNodesChange}
        // onEdgesChange={onEdgesChange}
        // onConnect={onConnect}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};
