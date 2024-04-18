import "reactflow/dist/style.css";

import { customColors } from "@hashintel/design-system/theme";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FlowDefinition as FlowDefinitionType,
  ProposedEntity,
  StepGroup,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Entity } from "@local/hash-subgraph";
import { Box, Stack, Typography } from "@mui/material";
import { useMemo } from "react";
import type { Edge } from "reactflow";
import { MarkerType, ReactFlowProvider } from "reactflow";

import { isNonNullable } from "../../lib/typeguards";
import { Deliverable } from "./flow-definition/deliverable";
import { EntityResultTable } from "./flow-definition/entity-result-table";
import { PersistedEntityGraph } from "./flow-definition/persisted-entity-graph";
import { nodeDimensions } from "./flow-definition/shared/dimensions";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import { useFlowRunsContext } from "./flow-definition/shared/flow-runs-context";
import type { CustomNodeType } from "./flow-definition/shared/types";
import {
  getFlattenedSteps,
  groupStepsByDependencyLayer,
} from "./flow-definition/sort-graph";
import { Swimlane } from "./flow-definition/swimlane";

const getGraphFromFlowDefinition = (
  flowDefinition: FlowDefinitionType,
  showAllDependencies: boolean = false,
) => {
  const hasGroups = (flowDefinition.groups ?? []).length > 0;

  const { layerByStepId } = groupStepsByDependencyLayer(flowDefinition.steps);

  const groupAssignments: number[] = [];

  const groupByLayer: Map<number, number> = new Map();

  const flattenedSteps = getFlattenedSteps(flowDefinition.steps);

  const derivedNodes: CustomNodeType[] = flattenedSteps.map((step) => {
    if (hasGroups && !step.groupId) {
      throw new Error(
        `Flow defines groups, but step ${step.stepId} is missing a groupId.`,
      );
    }

    if (step.groupId) {
      const lastGroupAssigned = groupAssignments.at(-1);
      if (lastGroupAssigned && lastGroupAssigned > step.groupId) {
        throw new Error(
          `Step ${step.stepId} belongs to groupId ${step.groupId}, but appears after member(s) of group ${lastGroupAssigned}.`,
        );
      }

      const layer = layerByStepId.get(step.stepId);
      if (layer === undefined) {
        throw new Error(
          `Step ${step.stepId} is missing from the dependency layers.`,
        );
      }

      const groupForLayer = groupByLayer.get(layer);
      if (groupForLayer === undefined) {
        groupByLayer.set(layer, step.groupId);
      } else if (groupForLayer !== step.groupId) {
        throw new Error(
          `Step ${step.stepId} is assigned to group ${step.groupId}, but an earlier step in the same dependency layer is assigned to group ${groupForLayer}. Dependency layers must belong to the same group.`,
        );
      }

      groupAssignments.push(step.groupId);
    }

    const node: CustomNodeType = {
      id: step.stepId,
      data: {
        groupId: step.groupId,
        kind: step.kind,
        actionDefinition:
          step.kind === "action"
            ? actionDefinitions[step.actionDefinitionId]
            : null,
        label: step.description,
        inputSources:
          step.kind === "parallel-group"
            ? [step.inputSourceToParallelizeOn]
            : step.inputSources,
      },
      type: step.kind,
      parentNode: step.parallelParentId,
      extent: step.parallelParentId ? ("parent" as const) : undefined,
      position: { x: 0, y: 0 },
      ...nodeDimensions,
    };

    return node;
  });

  const derivedEdges: Edge[] = [];
  for (let i = 0; i < derivedNodes.length; i++) {
    const node = derivedNodes[i]!;

    const baseEdgeOptions = {
      type: "custom-edge",
      markerEnd: {
        type: MarkerType.Arrow,
        width: 18,
        height: 18,
        color: customColors.gray[50],
      },
      /**
       * If this isn't set, the edge container will have a zIndex of 0 and appear below a parent node,
       * meaning that edges between nodes in a sub-flow are not visible.
       * Needs further investigation with more complex flows.
       */
      zIndex: 1,
    };

    if (showAllDependencies) {
      for (const inputSource of node.data.inputSources) {
        if (inputSource.kind === "step-output") {
          derivedEdges.push({
            id: `${flowDefinition.name}-${inputSource.sourceStepId}-${node.id}`,
            source: inputSource.sourceStepId,
            sourceHandle: inputSource.sourceStepOutputName,
            target: node.id,
            targetHandle: inputSource.inputName,
            ...baseEdgeOptions,
          });
        }
      }
    } else {
      const nextNode = derivedNodes[i + 1];

      const thisGroup = node.data.groupId;
      const nextGroup = nextNode?.data.groupId;

      if (
        nextNode &&
        nextNode.parentNode !== node.id &&
        thisGroup === nextGroup
      ) {
        derivedEdges.push({
          id: `${node.id}-${nextNode.id}`,
          source: node.id,
          target: nextNode.id,
          ...baseEdgeOptions,
        });
      }
    }
  }

  return {
    nodes: derivedNodes,
    edges: derivedEdges,
  };
};

const SectionLabel = ({ text }: { text: string }) => (
  <Typography
    variant="smallCaps"
    sx={{
      color: ({ palette }) => palette.gray[50],
      fontWeight: 600,
      textTransform: "uppercase",
    }}
  >
    {text}
  </Typography>
);

export const FlowDefinition = () => {
  const { flowDefinitions, selectedFlow, setSelectedFlow } =
    useFlowDefinitionsContext();

  const { flowRuns, selectedFlowRun, setSelectedFlowRun } =
    useFlowRunsContext();

  const { nodes: derivedNodes, edges: derivedEdges } = useMemo(() => {
    return getGraphFromFlowDefinition(selectedFlow);
  }, [selectedFlow]);

  const nodesAndEdgesByGroup = useMemo(() => {
    const graphsByGroup: Record<
      number,
      {
        group: StepGroup;
        edges: Edge[];
        nodes: CustomNodeType[];
      }
    > = {};

    for (const node of derivedNodes) {
      if (!node.data.groupId) {
        /**
         * We validate that either all or no steps have a groupId, so this must be an ungrouped Flow
         */
        return {
          0: { edges: derivedEdges, group: null, nodes: derivedNodes },
        };
      }

      const group = selectedFlow.groups?.find(
        (grp) => grp.groupId === node.data.groupId,
      );

      if (!group) {
        throw new Error(
          `No group with id ${node.data.groupId} found in flow definition`,
        );
      }

      graphsByGroup[node.data.groupId] ??= { edges: [], group, nodes: [] };

      graphsByGroup[node.data.groupId]!.nodes.push(node);

      graphsByGroup[node.data.groupId]!.edges.push(
        ...derivedEdges.filter((edge) => edge.source === node.id),
      );
    }

    return graphsByGroup;
  }, [derivedNodes, derivedEdges, selectedFlow.groups]);

  const { persistedEntities, proposedEntities } = useMemo(() => {
    if (!selectedFlowRun) {
      return { persistedEntities: [], proposedEntities: [] };
    }
    const persisted: Entity[] = [];
    const proposed: ProposedEntity[] = [];

    for (const step of selectedFlowRun.steps) {
      const outputs = step.outputs?.[0]?.contents?.[0]?.outputs ?? [];

      if (outputs.length === 0) {
        for (const log of step.logs) {
          if (log.type === "ProposedEntity") {
            proposed.push(log.proposedEntity);
          }
          if (log.type === "PersistedEntity" && log.persistedEntity.entity) {
            persisted.push(log.persistedEntity.entity);
          }
        }
        continue;
      }

      for (const output of outputs) {
        switch (output.payload.kind) {
          case "ProposedEntity":
            if (Array.isArray(output.payload.value)) {
              proposed.push(...output.payload.value);
            } else {
              proposed.push(output.payload.value);
            }
            break;
          case "Entity":
            if (Array.isArray(output.payload.value)) {
              persisted.push(...output.payload.value);
            } else {
              persisted.push(output.payload.value);
            }
            break;
          case "PersistedEntity":
            if (Array.isArray(output.payload.value)) {
              persisted.push(
                ...output.payload.value
                  .map((inner) => inner.entity)
                  .filter(isNonNullable),
              );
            } else if (output.payload.value.entity) {
              persisted.push(output.payload.value.entity);
            }
            break;
          case "PersistedEntities":
            if (Array.isArray(output.payload.value)) {
              persisted.push(
                ...output.payload.value.flatMap((innerMap) =>
                  innerMap.persistedEntities
                    .map((inner) => inner.entity)
                    .filter(isNonNullable),
                ),
              );
            } else {
              persisted.push(
                ...output.payload.value.persistedEntities
                  .map((inner) => inner.entity)
                  .filter(isNonNullable),
              );
            }
        }
      }
    }
    return { proposedEntities: proposed, persistedEntities: persisted };
  }, [selectedFlowRun]);

  const runOptions = useMemo(
    () =>
      flowRuns.filter(
        (run) => run.inputs[0].flowDefinition.name === selectedFlow.name,
      ),
    [flowRuns, selectedFlow.name],
  );

  return (
    <Box
      sx={{
        width: "100%",
        background: ({ palette }) => palette.gray[10],
        pb: 8,
      }}
    >
      <Box p={3}>
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
      </Box>
      <Box sx={{ px: 3 }}>
        <SectionLabel text="status" />
        <Box
          sx={({ palette }) => ({
            background: palette.common.white,
            border: `1px solid ${palette.gray[20]}`,
            borderRadius: 2.5,
          })}
        >
          {Object.entries(nodesAndEdgesByGroup).map(
            ([groupId, { group, nodes, edges }]) => (
              <ReactFlowProvider key={groupId}>
                <Swimlane group={group} nodes={nodes} edges={edges} />
              </ReactFlowProvider>
            ),
          )}
        </Box>
      </Box>

      <Stack
        direction="row"
        justifyContent="space-between"
        sx={{
          borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
          height: 400,
          px: 3,
          mt: 3,
        }}
      >
        <Box
          sx={{
            height: "100%",
            width: "100%",
            borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
            pr: 3,
            pt: 2.5,
          }}
        >
          <SectionLabel text="Raw output" />
          <Stack direction="row" gap={1} sx={{ height: "100%", width: "100%" }}>
            <EntityResultTable
              persistedEntities={persistedEntities}
              proposedEntities={proposedEntities}
            />
            <PersistedEntityGraph persistedEntities={persistedEntities} />
          </Stack>
        </Box>
        <Box sx={{ width: "40%", pl: 3, pt: 2.5 }}>
          <SectionLabel text="Deliverable" />

          <Deliverable outputs={selectedFlowRun?.outputs ?? []} />
        </Box>
      </Stack>
    </Box>
  );
};
