import "reactflow/dist/style.css";

import { useMutation } from "@apollo/client";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FlowDefinition as FlowDefinitionType,
  FlowTrigger,
  ProposedEntity,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import type { Entity } from "@local/hash-subgraph";
import { Box, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { useCallback, useMemo, useState } from "react";
import { ReactFlowProvider } from "reactflow";

import type {
  StartFlowMutation,
  StartFlowMutationVariables,
} from "../../graphql/api-types.gen";
import { startFlowMutation } from "../../graphql/queries/knowledge/entity.queries";
import { isNonNullable } from "../../lib/typeguards";
import { Deliverables } from "./flow-definition/outputs/deliverables";
import { EntityResultTable } from "./flow-definition/outputs/entity-result-table";
import { FlowRunSidebar } from "./flow-definition/flow-run-sidebar";
import { PersistedEntityGraph } from "./flow-definition/outputs/persisted-entity-graph";
import { RunFlowModal } from "./flow-definition/run-flow-modal";
import { SectionLabel } from "./flow-definition/section-label";
import { nodeDimensions } from "./flow-definition/shared/dimensions";
import { useFlowDefinitionsContext } from "./flow-definition/shared/flow-definitions-context";
import { useFlowRunsContext } from "./flow-definition/shared/flow-runs-context";
import {
  flowSectionBorderRadius,
  transitionOptions,
} from "./flow-definition/shared/styles";
import type {
  CustomEdgeType,
  CustomNodeType,
  EdgeData,
  FlowMaybeGrouped,
} from "./flow-definition/shared/types";
import {
  getFlattenedSteps,
  groupStepsByDependencyLayer,
} from "./flow-definition/sort-graph";
import { Swimlane } from "./flow-definition/swimlane";
import { Topbar } from "./flow-definition/topbar";
import { ActivityLog } from "./flow-definition/activity-log";
import { Outputs } from "./flow-definition/outputs";

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

  const derivedEdges: CustomEdgeType[] = [];
  for (let i = 0; i < derivedNodes.length; i++) {
    const node = derivedNodes[i]!;

    const baseEdgeOptions = {
      data: { sourceStatus: "Waiting" } satisfies EdgeData,
      type: "custom-edge",
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

export const FlowDefinition = () => {
  const { selectedFlow } = useFlowDefinitionsContext();

  const { selectedFlowRun } = useFlowRunsContext();

  const { nodes: derivedNodes, edges: derivedEdges } = useMemo(() => {
    return getGraphFromFlowDefinition(selectedFlow);
  }, [selectedFlow]);

  const [showRunModal, setShowRunModal] = useState(false);

  const flowMaybeGrouped = useMemo<FlowMaybeGrouped>(() => {
    const graphsByGroup: FlowMaybeGrouped = { type: "grouped", groups: [] };

    for (const node of derivedNodes) {
      if (!node.data.groupId) {
        /**
         * We validate that either all or no steps have a groupId, so this must be an ungrouped Flow
         */
        return {
          type: "ungrouped",
          groups: [
            {
              group: null,
              edges: derivedEdges,
              nodes: derivedNodes,
            },
          ],
        };
      }

      const groupDefinition = selectedFlow.groups?.find(
        (grp) => grp.groupId === node.data.groupId,
      );

      if (!groupDefinition) {
        throw new Error(
          `No group with id ${node.data.groupId} found in flow definition`,
        );
      }

      let group = graphsByGroup.groups.find(
        (grp) => grp.group.groupId === groupDefinition.groupId,
      );

      if (!group) {
        group = {
          edges: [],
          group: groupDefinition,
          nodes: [],
        };

        graphsByGroup.groups.push(group);
      }

      group.nodes.push(node);

      group.edges.push(
        ...derivedEdges.filter((edge) => edge.source === node.id),
      );
    }

    return graphsByGroup;
  }, [derivedNodes, derivedEdges, selectedFlow.groups]);

  const { logs, persistedEntities, proposedEntities } = useMemo<{
    logs: StepProgressLog[];
    persistedEntities: Entity[];
    proposedEntities: ProposedEntity[];
  }>(() => {
    if (!selectedFlowRun) {
      return { logs: [], persistedEntities: [], proposedEntities: [] };
    }

    const logs: StepProgressLog[] = [];
    const persisted: Entity[] = [];
    const proposed: ProposedEntity[] = [];

    for (const step of selectedFlowRun.steps) {
      const outputs = step.outputs?.[0]?.contents?.[0]?.outputs ?? [];

      for (const log of step.logs) {
        logs.push(log);

        if (outputs.length === 0) {
          if (log.type === "ProposedEntity") {
            proposed.push(log.proposedEntity);
          }
          if (log.type === "PersistedEntity" && log.persistedEntity.entity) {
            persisted.push(log.persistedEntity.entity);
          }
        }
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
    return { logs, proposedEntities: proposed, persistedEntities: persisted };
  }, [selectedFlowRun]);

  const [startFlow] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const handleRunFlowClicked = useCallback(() => {
    setShowRunModal(true);
  }, []);

  const flowDefinitionStateKey = `${selectedFlow.name}`;
  const flowRunStateKey = `${flowDefinitionStateKey}-${
    selectedFlowRun?.runId ?? "definition"
  }`;

  return (
    <>
      <RunFlowModal
        key={selectedFlow.name}
        flowDefinition={selectedFlow}
        open={showRunModal}
        onClose={() => setShowRunModal(false)}
        runFlow={(outputs: FlowTrigger["outputs"], webId) => {
          void startFlow({
            variables: {
              flowDefinition: selectedFlow,
              flowTrigger: {
                outputs,
                triggerDefinitionId: "userTrigger",
              },
              webId,
            },
          });
          setShowRunModal(false);
        }}
      />
      <Topbar handleRunFlowClicked={handleRunFlowClicked} />
      <Stack
        direction="row"
        sx={{
          width: "100%",
          background: ({ palette }) =>
            selectedFlowRun ? palette.gray[10] : "rgb(241, 246, 251)",
          transition: ({ transitions }) =>
            transitions.create("background", transitionOptions),
          pt: 1.5,
          pb: 3,
        }}
      >
        {selectedFlowRun ? (
          <FlowRunSidebar
            flowDefinition={selectedFlow}
            groups={flowMaybeGrouped.groups}
          />
        ) : null}
        <Box sx={{ minHeight: 300, px: 3 }}>
          <SectionLabel text={selectedFlowRun ? "status" : "definition"} />
          <Box
            sx={({ palette, transitions }) => ({
              background: palette.common.white,
              border: `1px solid ${palette.gray[selectedFlowRun ? 20 : 30]}`,
              borderRadius: flowSectionBorderRadius,
              "& > :first-of-type": {
                borderTopRightRadius: flowSectionBorderRadius,
                borderTopLeftRadius: flowSectionBorderRadius,
              },
              "& > :last-child": {
                borderBottomRightRadius: flowSectionBorderRadius,
                borderBottomLeftRadius: flowSectionBorderRadius,
              },
              "& > :last-child > :first-of-type": {
                borderBottomLeftRadius: flowSectionBorderRadius,
              },
              transition: transitions.create("border", transitionOptions),
            })}
          >
            <Stack
              direction="row"
              sx={{
                borderBottom: ({ palette }) => `1px solid ${palette.gray[20]}`,
                p: 3,
              }}
            >
              {selectedFlowRun ? (
                <Typography
                  variant="smallTextParagraphs"
                  sx={{ color: ({ palette }) => palette.gray[60] }}
                >
                  Started <strong>manually</strong> when triggered on{" "}
                  {format(
                    new Date(selectedFlowRun.startedAt),
                    "yyyy-MM-dd 'at' h:mm a",
                  )}
                </Typography>
              ) : (
                <>
                  <Typography
                    component="span"
                    sx={{ fontSize: 14, fontWeight: 600, mr: 2 }}
                  >
                    {selectedFlow.name}
                  </Typography>
                  <Typography
                    component="span"
                    sx={{ fontSize: 14, fontWeight: 400 }}
                  >
                    {selectedFlow.description}
                  </Typography>
                </>
              )}
            </Stack>

            {flowMaybeGrouped.groups.map(({ group, nodes, edges }) => (
              <ReactFlowProvider
                key={`${flowDefinitionStateKey}-${
                  group?.groupId ?? "ungrouped"
                }`}
              >
                <Swimlane group={group} nodes={nodes} edges={edges} />
              </ReactFlowProvider>
            ))}
          </Box>
        </Box>
      </Stack>

      <Stack
        direction="row"
        justifyContent="space-between"
        sx={({ palette }) => ({
          background: palette.gray[10],
          borderTop: `1px solid ${palette.gray[20]}`,
          height: 500,
          px: 3,
          width: "100%",
        })}
      >
        <Box
          sx={{
            borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
            py: 2.5,
            pr: 3,
            overflow: "auto",
            resize: "horizontal",
            width: "50%",
          }}
        >
          <Box sx={{ height: "calc(100% - 40px)" }}>
            <SectionLabel text="Activity log" />
            <ActivityLog key={`${flowRunStateKey}-activity-log`} logs={logs} />
          </Box>
        </Box>
        <Box
          sx={{
            flex: 1,
            py: 2.5,
            pl: 3,
          }}
        >
          <Box sx={{ height: "calc(100% - 40px)" }}>
            <Outputs
              key={`${flowRunStateKey}-outputs`}
              persistedEntities={persistedEntities}
              proposedEntities={proposedEntities}
            />
          </Box>
        </Box>
      </Stack>
    </>
  );
};
