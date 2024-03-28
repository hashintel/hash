import "reactflow/dist/style.css";

import ELK, { ElkNode } from "elkjs/lib/elk.bundled.js";

import { Box } from "@mui/material";
import { BackgroundVariant } from "@reactflow/background";
import { useEffect, useMemo, useState } from "react";
import type { Edge } from "reactflow";
import ReactFlow, {
  Background,
  Controls,
  getNodesBounds,
  useEdgesState,
  useNodesInitialized,
  useNodesState,
  useReactFlow,
} from "reactflow";

import { CustomNode } from "./flow-definition/custom-node";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import { FlowDefinition as FlowDefinitionType } from "@local/hash-isomorphic-utils/flows/types";
import { CustomNodeType } from "./flow-definition/shared/types";
import { useFlowRunsContext } from "./flow-definition/shared/flow-runs-context";

const nodeTypes = {
  action: CustomNode,
  "parallel-group": CustomNode,
  trigger: CustomNode,
};

const elk = new ELK();

const elkLayoutOptions: ElkNode["layoutOptions"] = {
  "elk.algorithm": "layered",
  "elk.layered.spacing.nodeNodeBetweenLayers": "100",
  "elk.spacing.nodeNode": "100",
  "elk.padding": "[left=30, top=30]",
};

const initialNodeDimensions = {
  width: 300,
  height: 150,
};

const getGraphFromFlowDefinition = (flowDefinition: FlowDefinitionType) => {
  const derivedNodes: CustomNodeType[] = [
    {
      id: "trigger",
      data: {
        label: flowDefinition.trigger.definition.name,
        stepDefinition: {
          ...flowDefinition.trigger.definition,
          outputs:
            flowDefinition.trigger.outputs ??
            flowDefinition.trigger.definition.outputs,
        },
        inputSources: [],
      },
      type: "trigger",
      position: { x: 0, y: 0 },
      ...initialNodeDimensions,
    },
  ];

  derivedNodes.push(
    ...flowDefinition.steps.flatMap((node) => {
      const rootNode = {
        id: node.stepId,
        data: {
          stepDefinition: node.kind === "action" ? node.actionDefinition : null,
          label: node.kind === "action" ? node.actionDefinition.name : "",
          inputSources:
            node.kind === "parallel-group"
              ? [node.inputSourceToParallelizeOn]
              : node.inputSources,
        },
        type: node.kind,
        position: { x: 0, y: 0 },
        ...initialNodeDimensions,
      };

      const stepNodes: CustomNodeType[] = [rootNode];

      if (node.kind === "parallel-group") {
        const children = node.steps.map((step) => ({
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
          ...initialNodeDimensions,
        }));

        stepNodes.push(...children);

        const bounds = getNodesBounds(children);

        rootNode.width = bounds.width + 80;
        rootNode.height = bounds.height + 80;
      }

      return stepNodes;
    }),
  );

  const derivedEdges: Edge[] = [];
  for (const node of derivedNodes) {
    for (const inputSource of node.data.inputSources) {
      if (inputSource.kind === "step-output") {
        derivedEdges.push({
          id: `${flowDefinition.name}-${inputSource.sourceStepId}-${node.id}`,
          source: inputSource.sourceStepId,
          sourceHandle: inputSource.sourceStepOutputName,
          target: node.id,
          targetHandle: inputSource.inputName,
          animated: true,
          style: { stroke: "blue" },
        });
      }
    }
  }

  return {
    nodes: derivedNodes,
    edges: derivedEdges,
  };
};

export const FlowDefinition = () => {
  const { fitView } = useReactFlow();
  // const nodesHaveBeenMeasured = useNodesInitialized();

  const {
    flowDefinitions,
    selectedFlow,
    setSelectedFlow,
    direction,
    setDirection,
  } = useFlowDefinitionsContext();

  const { flowRuns, selectedFlowRun, setSelectedFlowRun } =
    useFlowRunsContext();

  const { nodes: derivedNodes, edges: derivedEdges } = useMemo(() => {
    return getGraphFromFlowDefinition(selectedFlow);
  }, [selectedFlow]);

  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  useEffect(() => {
    const graph: ElkNode = {
      id: selectedFlow.name,
      layoutOptions: {
        ...elkLayoutOptions,
        "elk.direction": direction,
      },
      children: derivedNodes,
      edges: derivedEdges,
    };

    void elk
      .layout(graph)
      .then(({ children }) => {
        return (children ?? []).map((node) => ({
          ...node,
          position: { x: node.x, y: node.y },
        }));
      })
      .then((laidOutElements) => {
        /** Reset the nodes to stop mismatch issues between old and new graph data, repeated ids etc, when switching flows */
        setNodes([]);
        setEdges([]);

        setTimeout(() => {
          setNodes(laidOutElements);
          setEdges(derivedEdges);
        }, 0);

        window.requestAnimationFrame(() => fitView());
      });
  }, [
    direction,
    fitView,
    derivedEdges,
    derivedNodes,
    setNodes,
    setEdges,
    selectedFlow.name,
  ]);

  const runOptions = useMemo(
    () =>
      flowRuns.filter(
        (run) => run.inputs[0].flowDefinition.name === selectedFlow.name,
      ),
    [flowRuns, selectedFlow.name],
  );

  return (
    <Box sx={{ width: "100%", height: "calc(100vh - 200px)", p: 2 }}>
      <Box mb={1}>
        <select
          value={selectedFlow.name}
          onChange={(event) => {
            setSelectedFlow(
              flowDefinitions.find((def) => def.name === event.target.value)!,
            );
            setSelectedFlowRun(null);
          }}
        >
          {flowDefinitions.map((flow) => (
            <option key={flow.name} value={flow.name}>
              {flow.name}
            </option>
          ))}
        </select>
      </Box>
      {runOptions.length > 0 && (
        <Box mb={1}>
          <select
            value={selectedFlowRun?.runId}
            onChange={(event) => {
              setSelectedFlowRun(
                flowRuns.find((run) => run.runId === event.target.value) ??
                  null,
              );
            }}
          >
            <option disabled selected value="">
              -- select a run to view status --
            </option>
            {runOptions.map((run) => (
              <option key={run.runId} value={run.runId}>
                {run.runId}
              </option>
            ))}
          </select>
        </Box>
      )}
      <Box mb={2}>
        <select
          value={direction}
          onChange={(event) =>
            setDirection(event.target.value as "DOWN" | "RIGHT")
          }
        >
          {["DOWN", "RIGHT"].map((dir) => (
            <option key={dir} value={dir}>
              {dir}
            </option>
          ))}
        </select>
      </Box>
      <ReactFlow
        nodes={nodes}
        nodeTypes={nodeTypes}
        edges={edges}
        fitView
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        // onConnect={onConnect}
      >
        <Controls />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </Box>
  );
};
