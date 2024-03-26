import "reactflow/dist/style.css";

import type { Label } from "@dagrejs/dagre";
import Dagre from "@dagrejs/dagre";
import { Box } from "@mui/material";
import { BackgroundVariant } from "@reactflow/background";
import { useEffect, useLayoutEffect, useMemo } from "react";
import type { Edge, Node } from "reactflow";
import ReactFlow, { Background, Controls, useReactFlow } from "reactflow";

import { ActionNode } from "./flow-definition/action-node";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import type { NodeData } from "./flow-definition/shared/types";
import { TriggerNode } from "./flow-definition/trigger-node";

const graph = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));

const nodeTypes = {
  action: ActionNode,
  trigger: TriggerNode,
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
      ...selectedFlow.nodes.map((node, index) => ({
        id: node.nodeId,
        data: {
          stepDefinition: JSON.parse(JSON.stringify(node.definition)),
          label: node.definition.name,
          inputSources: node.inputSources,
        },
        type: node.definition.kind,
        position: { x: 0, y: 0 },
        height: 100,
        width: 200,
      })),
    );

    const derivedEdges: Edge[] = [];
    for (const node of derivedNodes) {
      for (const inputSource of node.data.inputSources) {
        if (inputSource.kind === "step-output") {
          derivedEdges.push({
            id: `${inputSource.sourceNodeId}-${node.id}`,
            source: inputSource.sourceNodeId,
            sourceHandle: inputSource.sourceNodeOutputName,
            target: node.id,
            targetHandle: inputSource.inputName,
          });
        }
      }
    }

    console.log({ derivedEdges });

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
