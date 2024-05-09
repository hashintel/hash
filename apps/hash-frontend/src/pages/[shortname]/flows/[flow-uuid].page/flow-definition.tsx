import "reactflow/dist/style.css";

import { useApolloClient, useMutation } from "@apollo/client";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type {
  FlowDefinition as FlowDefinitionType,
  FlowTrigger,
  PersistedEntity,
  ProposedEntity,
  StepProgressLog,
} from "@local/hash-isomorphic-utils/flows/types";
import { slugifyTypeTitle } from "@local/hash-isomorphic-utils/slugify-type-title";
import { Box, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReactFlowProvider } from "reactflow";

import type {
  StartFlowMutation,
  StartFlowMutationVariables,
} from "../../../../graphql/api-types.gen";
import { startFlowMutation } from "../../../../graphql/queries/knowledge/entity.queries";
import { HEADER_HEIGHT } from "../../../../shared/layout/layout-with-header/page-header";
import { useFlowDefinitionsContext } from "../../../shared/flow-definitions-context";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { ActivityLog } from "./flow-definition/activity-log";
import { FlowRunSidebar } from "./flow-definition/flow-run-sidebar";
import { Outputs } from "./flow-definition/outputs";
import { RunFlowModal } from "./flow-definition/run-flow-modal";
import { SectionLabel } from "./flow-definition/section-label";
import { nodeDimensions } from "./flow-definition/shared/dimensions";
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
import { Topbar, topbarHeight } from "./flow-definition/topbar";

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

const outputsHeight = 450;

const containerHeight = `calc(100vh - ${HEADER_HEIGHT}px)`;

export const FlowDefinition = () => {
  const apolloClient = useApolloClient();

  const { query } = useRouter();

  const { flowDefinitions, selectedFlow, setSelectedFlow } =
    useFlowDefinitionsContext();

  console.log(flowDefinitions.map((def) => slugifyTypeTitle(def.name)));

  /** @todo replace with real uuid once flow definitions are stored in the db */
  const slugifiedFlowName = query["flow-uuid"] as string;

  useEffect(() => {
    const flowDefinition = flowDefinitions.find(
      (def) => slugifyTypeTitle(def.name) === slugifiedFlowName,
    );
    if (flowDefinition && flowDefinition !== selectedFlow) {
      setSelectedFlow(flowDefinition);
    }
  }, [slugifiedFlowName, flowDefinitions, selectedFlow, setSelectedFlow]);

  const { selectedFlowRun, setSelectedFlowRunId } = useFlowRunsContext();

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
    persistedEntities: PersistedEntity[];
    proposedEntities: ProposedEntity[];
  }>(() => {
    if (!selectedFlowRun) {
      return { logs: [], persistedEntities: [], proposedEntities: [] };
    }

    const progressLogs: StepProgressLog[] = [];
    const persisted: PersistedEntity[] = [];
    const proposed: ProposedEntity[] = [];

    for (const step of selectedFlowRun.steps) {
      const outputs = step.outputs?.[0]?.contents?.[0]?.outputs ?? [];

      for (const log of step.logs) {
        progressLogs.push(log);

        if (outputs.length === 0) {
          if (log.type === "ProposedEntity") {
            proposed.push(log.proposedEntity);
          }
          if (log.type === "PersistedEntity" && log.persistedEntity.entity) {
            persisted.push(log.persistedEntity);
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
          case "PersistedEntity":
            if (Array.isArray(output.payload.value)) {
              persisted.push(...output.payload.value);
            } else if (output.payload.value.entity) {
              persisted.push(output.payload.value);
            }
            break;
          case "PersistedEntities":
            if (Array.isArray(output.payload.value)) {
              persisted.push(
                ...output.payload.value.flatMap(
                  (innerMap) => innerMap.persistedEntities,
                ),
              );
            } else {
              persisted.push(...output.payload.value.persistedEntities);
            }
        }
      }
    }
    return {
      logs: progressLogs,
      proposedEntities: proposed,
      persistedEntities: persisted,
    };
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
    selectedFlowRun?.workflowId ?? "definition"
  }`;

  return (
    <Box sx={{ height: containerHeight }}>
      <RunFlowModal
        key={selectedFlow.name}
        flowDefinition={selectedFlow}
        open={showRunModal}
        onClose={() => setShowRunModal(false)}
        runFlow={async (outputs: FlowTrigger["outputs"], webId) => {
          const { data } = await startFlow({
            variables: {
              flowDefinition: selectedFlow,
              flowTrigger: {
                outputs,
                triggerDefinitionId: "userTrigger",
              },
              webId,
            },
          });

          const workflowId = data?.startFlow;
          if (!workflowId) {
            throw new Error("Failed to start flow");
          }

          await apolloClient.refetchQueries({
            include: ["getFlowRuns"],
          });
          setSelectedFlowRunId(workflowId);

          setShowRunModal(false);
        }}
      />
      <Topbar handleRunFlowClicked={handleRunFlowClicked} />
      <Box
        sx={{
          height: `calc(100% - ${outputsHeight + topbarHeight}px)`,
          overflow: "auto",
          width: "100%",
          background: ({ palette }) =>
            selectedFlowRun ? palette.gray[10] : "rgb(241, 246, 251)",
          transition: ({ transitions }) =>
            transitions.create("background", transitionOptions),
          pt: 1.5,
          "&:after": {
            content: '""',
            display: "block",
            height: 24,
            width: "100%",
          },
        }}
      >
        <Stack
          direction="row"
          sx={{
            width: "100%",
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
                  borderBottom: ({ palette }) =>
                    `1px solid ${palette.gray[20]}`,
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
      </Box>

      <Stack
        direction="row"
        justifyContent="space-between"
        sx={({ palette }) => ({
          background: palette.gray[10],
          borderTop: `2px solid ${palette.gray[20]}`,
          height: outputsHeight,
          maxWidth: "100%",
          px: 3,
          width: "100%",
        })}
      >
        <Stack
          sx={{
            borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
            height: "100%",
            py: 2.5,
            pr: 3,
            width: "30%",
          }}
        >
          <ActivityLog key={`${flowRunStateKey}-activity-log`} logs={logs} />
        </Stack>
        <Stack
          sx={{
            height: "100%",
            py: 2.5,
            pl: 3,
            width: "70%",
          }}
        >
          <Outputs
            key={`${flowRunStateKey}-outputs`}
            persistedEntities={persistedEntities}
            proposedEntities={proposedEntities}
          />
        </Stack>
      </Stack>
    </Box>
  );
};
