import "reactflow/dist/style.css";

import { useApolloClient, useMutation } from "@apollo/client";
import { Skeleton } from "@hashintel/design-system";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { manualBrowserInferenceFlowDefinition } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import type {
  FlowDefinition as FlowDefinitionType,
  FlowTrigger,
  PersistedEntity,
  ProposedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import { Box, Stack, Typography } from "@mui/material";
import { format } from "date-fns";
import NotFound from "next/dist/client/components/not-found-error";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";
import { ReactFlowProvider } from "reactflow";

import { useGetOwnerForEntity } from "../../../components/hooks/use-get-owner-for-entity";
import type {
  StartFlowMutation,
  StartFlowMutationVariables,
} from "../../../graphql/api-types.gen";
import { startFlowMutation } from "../../../graphql/queries/knowledge/flow.queries";
import { HEADER_HEIGHT } from "../../../shared/layout/layout-with-header/page-header";
import { defaultBrowserPluginDomains } from "../../goals/new.page/internet-settings";
import { useFlowDefinitionsContext } from "../../shared/flow-definitions-context";
import { useFlowRunsContext } from "../../shared/flow-runs-context";
import { ActivityLog } from "./flow-visualizer/activity-log";
import { FlowRunSidebar } from "./flow-visualizer/flow-run-sidebar";
import { Outputs } from "./flow-visualizer/outputs";
import { RunFlowModal } from "./flow-visualizer/run-flow-modal";
import { SectionLabel } from "./flow-visualizer/section-label";
import { nodeDimensions } from "./flow-visualizer/shared/dimensions";
import {
  flowSectionBorderRadius,
  transitionOptions,
} from "./flow-visualizer/shared/styles";
import type {
  CustomEdgeType,
  CustomNodeType,
  EdgeData,
  FlowMaybeGrouped,
  LocalProgressLog,
} from "./flow-visualizer/shared/types";
import {
  getFlattenedSteps,
  groupStepsByDependencyLayer,
} from "./flow-visualizer/sort-graph";
import { Swimlane } from "./flow-visualizer/swimlane";
import { Topbar, topbarHeight } from "./flow-visualizer/topbar";

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

      const groupForThisNode = node.data.groupId;
      const groupForNextNode = nextNode?.data.groupId;

      if (
        nextNode &&
        nextNode.parentNode !== node.id &&
        groupForThisNode === groupForNextNode &&
        layerByStepId.get(node.id) !== layerByStepId.get(nextNode.id)
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

const unrunnableDefinitionIds = [
  manualBrowserInferenceFlowDefinition.flowDefinitionId,
];

export const FlowRunVisualizerSkeleton = () => (
  <Stack gap={3} sx={{ height: `calc(100vh - ${HEADER_HEIGHT + 40}px)` }}>
    <Box height={topbarHeight} px={2}>
      <Skeleton width="300px" height="100%" />
    </Box>
    <Box flexGrow={1} px={2}>
      <Skeleton width="70%" height="100%" />
    </Box>
    <Box height={outputsHeight} px={2}>
      <Skeleton width="70%" height="100%" />
    </Box>
  </Stack>
);

export const FlowVisualizer = () => {
  const apolloClient = useApolloClient();

  const { push } = useRouter();

  const { flowDefinitions, selectedFlowDefinitionId } =
    useFlowDefinitionsContext();

  const { selectedFlowRun } = useFlowRunsContext();

  const getOwner = useGetOwnerForEntity();

  const selectedFlowDefinition = useMemo(() => {
    return flowDefinitions.find(
      (def) => def.flowDefinitionId === selectedFlowDefinitionId,
    );
  }, [flowDefinitions, selectedFlowDefinitionId]);

  const { nodes: derivedNodes, edges: derivedEdges } = useMemo(() => {
    if (!selectedFlowDefinition) {
      return { nodes: [], edges: [] };
    }
    return getGraphFromFlowDefinition(selectedFlowDefinition);
  }, [selectedFlowDefinition]);

  const [showRunModal, setShowRunModal] = useState(false);

  const flowMaybeGrouped = useMemo<FlowMaybeGrouped>(() => {
    const graphsByGroup: FlowMaybeGrouped = { type: "grouped", groups: [] };

    if (!selectedFlowDefinition) {
      return {
        groups: [{ group: null, edges: [], nodes: [] }],
        type: "ungrouped",
      };
    }

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

      const groupDefinition = selectedFlowDefinition.groups?.find(
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
  }, [derivedNodes, derivedEdges, selectedFlowDefinition]);

  const { logs, persistedEntities, proposedEntities } = useMemo<{
    logs: LocalProgressLog[];
    persistedEntities: PersistedEntity[];
    proposedEntities: Omit<ProposedEntity, "provenance" | "propertyMetadata">[];
  }>(() => {
    if (!selectedFlowRun) {
      return { logs: [], persistedEntities: [], proposedEntities: [] };
    }

    const progressLogs: LocalProgressLog[] = [
      {
        message: "Flow run started",
        recordedAt: selectedFlowRun.startedAt,
        stepId: "trigger",
        type: "StateChange",
      },
    ];

    const persisted: PersistedEntity[] = [];
    const proposed: Omit<ProposedEntity, "provenance" | "propertyMetadata">[] =
      [];

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

  if (!selectedFlowDefinition) {
    if (selectedFlowDefinitionId) {
      /**
       * If we have a selected definition id but no definition, it doesn't exist
       * @todo when flow definitions are loaded from the database, this may no longer be true
       */
      return <NotFound />;
    }
    throw new Error("Is this possible?");
  }

  const flowDefinitionStateKey = `${selectedFlowDefinition.name} ?? "loading`;
  const flowRunStateKey = `${flowDefinitionStateKey}-${
    selectedFlowRun?.flowRunId ?? "definition"
  }`;

  const isRunnableFromHere =
    selectedFlowDefinition.trigger.triggerDefinitionId === "userTrigger" &&
    !unrunnableDefinitionIds.includes(selectedFlowDefinition.flowDefinitionId);

  return (
    <Box sx={{ height: containerHeight }}>
      {isRunnableFromHere && (
        <RunFlowModal
          key={selectedFlowDefinition.name}
          flowDefinition={selectedFlowDefinition}
          open={showRunModal}
          onClose={() => setShowRunModal(false)}
          runFlow={async (outputs: FlowTrigger["outputs"], webId) => {
            const { data } = await startFlow({
              variables: {
                dataSources: {
                  files: { fileEntityIds: [] },
                  internetAccess: {
                    browserPlugin: {
                      domains: defaultBrowserPluginDomains,
                      enabled: true,
                    },
                    enabled: true,
                  },
                },
                flowDefinition: selectedFlowDefinition,
                flowTrigger: {
                  outputs,
                  triggerDefinitionId: "userTrigger",
                },
                webId,
              },
            });

            const flowRunId = data?.startFlow;
            if (!flowRunId) {
              throw new Error("Failed to start flow");
            }

            await apolloClient.refetchQueries({
              include: ["getFlowRuns"],
            });

            setShowRunModal(false);

            const { shortname } = getOwner({ ownedById: webId });

            void push(generateWorkerRunPath({ shortname, flowRunId }));
          }}
        />
      )}
      <Topbar
        handleRunFlowClicked={handleRunFlowClicked}
        showRunButton={isRunnableFromHere}
      />
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
              flowDefinition={selectedFlowDefinition}
              flowRunId={selectedFlowRun.flowRunId}
              groups={flowMaybeGrouped.groups}
              name={selectedFlowRun.name}
            />
          ) : null}
          <Box sx={{ minHeight: 300, px: 3 }}>
            <SectionLabel text={selectedFlowRun ? "status" : "definition"} />
            <Stack
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
                flexWrap: "wrap",
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
                      {selectedFlowDefinition.name}
                    </Typography>
                    <Typography
                      component="span"
                      sx={{ fontSize: 14, fontWeight: 400 }}
                    >
                      {selectedFlowDefinition.description}
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
                  <Swimlane
                    group={group}
                    nodes={nodes}
                    edges={edges}
                    isOnlySwimlane={flowMaybeGrouped.groups.length === 1}
                  />
                </ReactFlowProvider>
              ))}
            </Stack>
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
