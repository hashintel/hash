import "reactflow/dist/style.css";

import { BackgroundVariant } from "@reactflow/background";
import { useMemo } from "react";
import type { Edge, Node } from "reactflow";
import ReactFlow, { Background, Controls } from "reactflow";

import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import type { NodeData } from "./flow-definition/shared/types";
import { ActionNode } from "./flow-definition/action-node";
import { TriggerNode } from "./flow-definition/trigger-node";

const nodeTypes = {
  action: ActionNode,
  trigger: TriggerNode,
};

export const FlowDefinition = () => {
  const { selectedFlow, setSelectedFlow } = useFlowDefinitionsContext();

  const { nodes, edges } = useMemo<{
    nodes: Node<NodeData>[];
    edges: Edge[];
  }>(() => {
    const derivedNodes: Node<NodeData>[] = [
      {
        id: "trigger",
        data: {
          label: selectedFlow.trigger.definition.name,
          stepDefinition: selectedFlow.trigger.definition,
          inputSources: [],
        },
        position: { x: 0, y: 0 },
        type: "trigger",
      },
    ];

    derivedNodes.push(
      ...selectedFlow.nodes.map((node, index) => ({
        id: node.nodeId,
        type: node.definition.kind,
        position: { x: 0, y: (index + 1) * 200 },
        data: {
          stepDefinition: JSON.parse(JSON.stringify(node.definition)),
          label: node.definition.name,
          inputSources: node.inputSources,
        },
      })),
    );

    const derivedEdges: Edge[] = [];
    for (const node of derivedNodes) {
      for (const inputSource of node.data.inputSources) {
        if (inputSource.kind === "step-output") {
          derivedEdges.push({
            id: `${inputSource.sourceNodeId}-${node.id}`,
            source: inputSource.sourceNodeId,
            target: node.id,
          });
        }
      }
    }

    return { nodes: derivedNodes, edges: derivedEdges };
  }, [selectedFlow]);

  return (
    <div style={{ width: "100%", height: 900 }}>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={edges}
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
