import "reactflow/dist/style.css";

import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { triggerDefinitions } from "@local/hash-isomorphic-utils/flows/trigger-definitions";
import type {
  FlowDefinition as FlowDefinitionType,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import { Box, Stack, Typography } from "@mui/material";
import { BackgroundVariant } from "@reactflow/background";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk.bundled.js";
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
import { Deliverable } from "./flow-definition/deliverable";
import { EntityResultTable } from "./flow-definition/entity-result-table";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import { useFlowRunsContext } from "./flow-definition/shared/flow-runs-context";
import { PersistedEntityGraph } from "./flow-definition/persisted-entity-graph";
import type { CustomNodeType } from "./flow-definition/shared/types";
import { Entity } from "@local/hash-subgraph";

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
  width: 320,
  height: 150,
};

const getGraphFromFlowDefinition = (flowDefinition: FlowDefinitionType) => {
  const trigger =
    triggerDefinitions[flowDefinition.trigger.triggerDefinitionId];

  const derivedNodes: CustomNodeType[] = [
    {
      id: "trigger",
      data: {
        label: trigger.name,
        stepDefinition: {
          ...trigger,
          outputs: trigger.outputs ?? trigger.outputs,
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
      const actionDefinition = actionDefinitions[node.actionDefinitionId];

      const rootNode = {
        id: node.stepId,
        data: {
          stepDefinition: node.kind === "action" ? actionDefinition : null,
          label: node.kind === "action" ? actionDefinition.name : "",
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

      // if (node.kind === "parallel-group") {
      //   const children = node.steps.map((step) => {
      //     const actionDefinition = actionDefinitions[step.actionDefinitionId];
      //
      //     return {
      //       id: step.stepId,
      //       data: {
      //         stepDefinition: actionDefinition,
      //         label: actionDefinition.name,
      //         inputSources: step.inputSources,
      //       },
      //       type: "action",
      //       parentNode: rootNode.id,
      //       extent: "parent" as const,
      //       position: { x: 0, y: 0 },
      //       ...initialNodeDimensions,
      //     };
      //   });
      //
      //   stepNodes.push(...children);
      //
      //   const bounds = getNodesBounds(children);
      //
      //   rootNode.width = bounds.width + 80;
      //   rootNode.height = bounds.height + 80;
      // }

      return stepNodes;
    }),
  );

  const showAllDependencies = false;

  const derivedEdges: Edge[] = [];
  for (let i = 0; i < derivedNodes.length; i++) {
    const node = derivedNodes[i]!;
    if (showAllDependencies) {
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
    } else {
      const nextNode = derivedNodes[i + 1];
      if (nextNode) {
        derivedEdges.push({
          id: `${node.id}-${nextNode.id}`,
          source: node.id,
          target: nextNode.id,
        });
      }
    }
  }

  console.log({ derivedEdges });

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

  const { persistedEntities, proposedEntities } = useMemo(() => {
    if (!selectedFlowRun) {
      return { persistedEntities: [], proposedEntities: [] };
    }
    const persistedEntities: Entity[] = [];
    const proposedEntities: ProposedEntity[] = [];

    selectedFlowRun.steps.forEach((step) => {
      const outputs = step.outputs?.[0]?.contents?.[0]?.outputs ?? [];

      for (const output of outputs) {
        if (output.payload.kind === "ProposedEntities") {
          proposedEntities.push(...output.payload.value);
        }
        if (output.payload.kind === "Entity") {
          console.log("Pushing", output.payload);
          persistedEntities.push(output.payload.value);
        }
        if (output.payload.kind === "PersistedEntity") {
          persistedEntities.push(output.payload.value.entity);
        }
        if (output.payload.kind === "PersistedEntities") {
          persistedEntities.push(
            ...output.payload.value.persistedEntities.map(
              (inner) => inner.entity,
            ),
          );
        }
      }
    });
    return { proposedEntities, persistedEntities };
  }, [selectedFlowRun]);

  console.log({ persistedEntities, proposedEntities });

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
    <Stack
      sx={{
        width: "100%",
        height: "calc(100vh - 160px)",
        background: ({ palette }) => palette.gray[10],
      }}
    >
      <Box p={4}>
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
              <option disabled selected value="disabled">
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
        {/*<Box mb={2}>*/}
        {/*  <select*/}
        {/*    value={direction}*/}
        {/*    onChange={(event) =>*/}
        {/*      setDirection(event.target.value as "DOWN" | "RIGHT")*/}
        {/*    }*/}
        {/*  >*/}
        {/*    {["DOWN", "RIGHT"].map((dir) => (*/}
        {/*      <option key={dir} value={dir}>*/}
        {/*        {dir}*/}
        {/*      </option>*/}
        {/*    ))}*/}
        {/*  </select>*/}
        {/*</Box>*/}
      </Box>
      <Stack sx={{ height: "100%" }}>
        <Box sx={{ height: "50vh" }}>
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
          </ReactFlow>
        </Box>
        <Stack
          direction="row"
          flexGrow={1}
          justifyContent="space-between"
          px={2}
          pt={1}
          sx={{
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
            height: "30%",
          }}
        >
          <Box
            sx={{
              height: "100%",
              width: "100%",
              borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
              pr: 2,
            }}
          >
            <Typography
              variant="smallCaps"
              sx={{ fontWeight: 600, color: ({ palette }) => palette.gray[50] }}
            >
              RAW OUTPUT
            </Typography>
            <Stack
              direction="row"
              gap={1}
              sx={{ height: "100%", width: "100%" }}
            >
              <EntityResultTable
                persistedEntities={persistedEntities}
                proposedEntities={proposedEntities}
              />
              <PersistedEntityGraph persistedEntities={persistedEntities} />
            </Stack>
          </Box>
          <Box sx={{ width: "30%", pl: 2 }}>
            <Typography
              variant="smallCaps"
              sx={{ fontWeight: 600, color: ({ palette }) => palette.gray[50] }}
            >
              DELIVERABLE
            </Typography>
            <Deliverable outputs={selectedFlowRun?.outputs} />
          </Box>
        </Stack>
      </Stack>
    </Stack>
  );
};
