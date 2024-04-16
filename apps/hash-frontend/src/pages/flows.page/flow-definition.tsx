import "reactflow/dist/style.css";

import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FlowDefinition as FlowDefinitionType,
  ProposedEntity,
  StepGroup,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Entity } from "@local/hash-subgraph";
import { Box, Stack, Typography } from "@mui/material";
import type { ElkNode } from "elkjs/lib/elk.bundled.js";
import ELK from "elkjs/lib/elk.bundled.js";
import { useMemo } from "react";
import type { Edge } from "reactflow";
import ReactFlow, { Controls, getNodesBounds } from "reactflow";

import { isNonNullable } from "../../lib/typeguards";
import { CustomNode } from "./flow-definition/custom-node";
import { Deliverable } from "./flow-definition/deliverable";
import { EntityResultTable } from "./flow-definition/entity-result-table";
import { PersistedEntityGraph } from "./flow-definition/persisted-entity-graph";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import { useFlowRunsContext } from "./flow-definition/shared/flow-runs-context";
import type { CustomNodeType } from "./flow-definition/shared/types";
import { DAG } from "./flow-definition/dag";

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
  "elk.direction": "RIGHT",
};

const initialNodeDimensions = {
  width: 350,
  height: 165,
};

const getGraphFromFlowDefinition = (
  flowDefinition: FlowDefinitionType,
  showAllDependencies: boolean = false,
) => {
  const hasGroups = (flowDefinition.groups ?? []).length > 0;

  const groupsAssigned: number[] = [];

  const derivedNodes: CustomNodeType[] = flowDefinition.steps.flatMap(
    (step) => {
      if (hasGroups && !step.groupId) {
        throw new Error(
          `Flow defines groups, but step ${step.stepId} is missing a groupId.`,
        );
      }

      if (step.groupId) {
        const lastGroupAssigned = groupsAssigned.at(-1);
        if (lastGroupAssigned && lastGroupAssigned > step.groupId) {
          throw new Error(
            `Step ${step.stepId} belongs to groupId ${step.groupId}, but appears after member(s) of group ${lastGroupAssigned}.`,
          );
        }

        groupsAssigned.push(step.groupId);
      }

      // @ts-expect-error –– excessively deep type. @todo look into this
      const rootNode: CustomNodeType = {
        id: step.stepId,
        data: {
          groupId: step.groupId,
          stepDefinition:
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
        position: { x: 0, y: 0 },
        ...initialNodeDimensions,
      };

      const stepNodes: CustomNodeType[] = [rootNode];

      if (step.kind === "parallel-group") {
        const children = step.steps.map((step, index) => {
          if (step.kind === "parallel-group") {
            // @todo support nested parallel groups
            throw new Error("Nested parallel groups are not yet supported");
          }

          const actionDefinition = actionDefinitions[step.actionDefinitionId];

          return {
            id: step.stepId,
            data: {
              stepDefinition: actionDefinition,
              label: actionDefinition.name,
              inputSources: step.inputSources,
            },
            type: "action",
            parentNode: rootNode.id,
            extent: "parent" as const,
            position: { x: 0, y: initialNodeDimensions.width * index },
            ...initialNodeDimensions,
          };
        });

        stepNodes.push(...children);

        const bounds = getNodesBounds(children);

        rootNode.width = bounds.width + 80;
        rootNode.height = bounds.height + 80;
      }

      return stepNodes;
    },
  );

  /**
   * @todo validate that
   *    1. all members of a dependency layer are assigned to the same step group, using groupStepsByDependencyLayer
   *    2. graph is topologically sorted (check that steps appear in same order as dependency layers. order within layer irrelevant)
   */

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

      const thisGroup = node.data.groupId;
      const nextGroup = nextNode?.data.groupId;

      if (nextNode && thisGroup === nextGroup) {
        derivedEdges.push({
          id: `${node.id}-${nextNode.id}`,
          source: node.id,
          target: nextNode.id,
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
        (group) => group.groupId === node.data.groupId,
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

  console.log({ persistedEntities, proposedEntities });

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
      </Box>
      <Stack sx={{ height: "100%" }}>
        <Stack sx={{ flexGrow: 1 }}>
          {Object.entries(nodesAndEdgesByGroup).map(
            ([groupId, { group, nodes, edges }]) => (
              <DAG key={groupId} group={group} nodes={nodes} edges={edges} />
            ),
          )}
        </Stack>
        <Stack
          direction="row"
          justifyContent="space-between"
          px={2}
          pt={1}
          sx={{
            borderTop: ({ palette }) => `1px solid ${palette.gray[20]}`,
            minHeight: 300,
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
          <Box sx={{ width: "40%", pl: 2 }}>
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
