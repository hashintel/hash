import "reactflow/dist/style.css";

import { useApolloClient, useMutation } from "@apollo/client";
import type { EntityId, WebId } from "@blockprotocol/type-system";
import { IconButton, Skeleton } from "@hashintel/design-system";
import type { OutputNameForAiFlowAction } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { actionDefinitions } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { manualBrowserInferenceFlowDefinition } from "@local/hash-isomorphic-utils/flows/browser-plugin-flow-definitions";
import { generateWorkerRunPath } from "@local/hash-isomorphic-utils/flows/frontend-paths";
import { goalFlowDefinitionIds } from "@local/hash-isomorphic-utils/flows/goal-flow-definitions";
import type {
  FlowDefinition as FlowDefinitionType,
  FlowInputs,
  FlowTrigger,
  PersistedEntity,
} from "@local/hash-isomorphic-utils/flows/types";
import { Box, Collapse, Fade, Stack } from "@mui/material";
import { useRouter } from "next/router";
import { useCallback, useMemo, useState } from "react";

import { useGetOwnerForEntity } from "../../../../components/hooks/use-get-owner-for-entity";
import type {
  StartFlowMutation,
  StartFlowMutationVariables,
} from "../../../../graphql/api-types.gen";
import { startFlowMutation } from "../../../../graphql/queries/knowledge/flow.queries";
import { ArrowRightToLineIcon } from "../../../../shared/icons/arrow-right-to-line-icon";
import { HEADER_HEIGHT } from "../../../../shared/layout/layout-with-header/page-header";
import { defaultBrowserPluginDomains } from "../../../goals/new.page/internet-settings";
import { useFlowDefinitionsContext } from "../../../shared/flow-definitions-context";
import { useFlowRunsContext } from "../../../shared/flow-runs-context";
import { NotFound } from "../../../shared/not-found";
import { ActivityLog } from "./flow-visualizer/activity-log";
import { DAG } from "./flow-visualizer/dag";
import { DagSlide } from "./flow-visualizer/dag-slide";
import { FlowRunSidebar } from "./flow-visualizer/flow-run-sidebar";
import { Outputs } from "./flow-visualizer/outputs";
import { RunFlowModal } from "./flow-visualizer/run-flow-modal";
import { SectionLabel } from "./flow-visualizer/section-label";
import { nodeDimensions } from "./flow-visualizer/shared/dimensions";
import { transitionOptions } from "./flow-visualizer/shared/styles";
import type {
  CustomEdgeType,
  CustomNodeType,
  EdgeData,
  FlowMaybeGrouped,
  LocalProgressLog,
  LogDisplay,
  LogThread,
  ProposedEntityOutput,
} from "./flow-visualizer/shared/types";
import {
  getFlattenedSteps,
  groupStepsByDependencyLayer,
} from "./flow-visualizer/sort-graph";
import { Topbar, topbarHeight } from "./flow-visualizer/topbar";

const getGraphFromFlowDefinition = (
  flowDefinition: FlowDefinitionType,
  showAllDependencies = false,
) => {
  /**
   * Flows may organize their steps into 'groups'.
   * Groups are essentially a way of labelling sets of steps, used to organize the UI into sequentially-executing lanes.
   * Assigning steps to groups does not affect how the flow runs – it is for user/UI convenience.
   * The only constraint is that each 'dependency layer' (set of steps that can run in parallel)
   * must be fully contained in a group, such that only one group is executing at a time.
   */
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

const logHeight = 400;

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
    <Box height={logHeight} px={2}>
      <Skeleton width="70%" height="100%" />
    </Box>
  </Stack>
);

export const FlowVisualizer = () => {
  const [showDag, setShowDag] = useState(false);

  const [bottomPanelIsCollapsed, setBottomPanelIsCollapsed] = useState(false);

  const [logDisplay, setLogDisplay] = useState<LogDisplay>("grouped");

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

  const { logs, persistedEntities, proposedEntities, relevantEntityIds } =
    useMemo<{
      logs: LocalProgressLog[];
      persistedEntities: PersistedEntity[];
      proposedEntities: ProposedEntityOutput[];
      relevantEntityIds: EntityId[];
    }>(() => {
      if (!selectedFlowRun) {
        return {
          claimEntityIds: [],
          logs: [],
          persistedEntities: [],
          proposedEntities: [],
          relevantEntityIds: [],
        };
      }

      const progressLogs: LocalProgressLog[] = [
        {
          level: 1,
          message: "Flow run started",
          recordedAt: selectedFlowRun.startedAt,
          stepId: "trigger",
          type: "StateChange",
        },
      ];

      const persisted: PersistedEntity[] = [];
      const proposed: ProposedEntityOutput[] = [];
      const highlightedEntityIds: EntityId[] = [];

      /**
       * A map between a workerInstanceId and (1) the list of logs associated with that worker, and (2) the id of its parent
       * This is used to help build the tree of logs grouped by worker, when 'grouped' log display is selected.
       */
      const workerIdToLogsAndParent: Record<
        string,
        { logs: LocalProgressLog[]; level: number; thread?: LogThread }
      > = {};

      for (const step of selectedFlowRun.steps) {
        const outputs = step.outputs?.[0]?.contents[0]?.outputs ?? [];

        for (const log of step.logs) {
          if (
            logDisplay === "stream" ||
            !("parentInstanceId" in log) ||
            !log.parentInstanceId
          ) {
            /**
             * If we're in 'stream' display, or if this log doesn't have a parent worker, it should appear at the top level.
             */
            progressLogs.push({
              ...log,
              level: 1,
            });

            if ("workerInstanceId" in log) {
              /**
               * If the log has a workerInstanceId, it may have groups of logs nested under it,
               * so we need to record the fact that any child workers should start a group in the top-level logs array.
               */
              workerIdToLogsAndParent[log.workerInstanceId] = {
                level: 1,
                logs: progressLogs,
              };
            }
          } else {
            /**
             * This log has a parent worker, so we need to group it with its siblings.
             * We also need to add the group to the parent's logs if it doesn't already exist.
             */
            const parentLogList = workerIdToLogsAndParent[log.parentInstanceId];
            if (!parentLogList) {
              throw new Error(
                `No parent log found with id ${log.parentInstanceId}`,
              );
            }

            const thisThread = workerIdToLogsAndParent[log.workerInstanceId];
            if (!thisThread) {
              let threadLabel: string;
              if (log.type === "StartedSubCoordinator") {
                threadLabel = `Sub-coordinator: ${log.input.goal}`;
              } else if (log.type === "StartedLinkExplorerTask") {
                threadLabel = `Link explorer: ${log.input.goal}`;
              } else {
                throw new Error(
                  `Expect new child worker threads to be started with a StartedSubCoordinator or StartedLinkExplorerTask event, got ${log.type}`,
                );
              }

              const newThread = {
                type: "Thread" as const,
                label: threadLabel,
                level: parentLogList.level,
                threadStartedAt: log.recordedAt,
                /**
                 * Default to closing the thread at the time the flow run was closed.
                 * If we have a specific, earlier closed event for the thread it will be overwritten when we process that child log.
                 */
                threadClosedAt: selectedFlowRun.closedAt ?? undefined,
                closedDueToFlowClosure: !!selectedFlowRun.closedAt,
                threadWorkerId: log.workerInstanceId,
                recordedAt: log.recordedAt,
                logs: [
                  {
                    level: parentLogList.level + 1,
                    ...log,
                  },
                ],
              };

              parentLogList.logs.push(newThread);

              workerIdToLogsAndParent[log.workerInstanceId] = {
                logs: newThread.logs,
                level: newThread.level,
                thread: newThread,
              };
            } else {
              thisThread.logs.push({
                level: parentLogList.level + 1,
                ...log,
              });

              if (
                log.type === "ClosedLinkExplorerTask" ||
                log.type === "ClosedSubCoordinator"
              ) {
                thisThread.thread!.threadClosedAt = log.recordedAt;
                thisThread.thread!.closedDueToFlowClosure = false;
              }
            }
          }

          if (outputs.length === 0) {
            if (log.type === "ProposedEntity") {
              proposed.push({
                ...log.proposedEntity,
                researchOngoing: !["CANCELLED", "FAILED", "TIMED_OUT"].includes(
                  step.status,
                ),
              });
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
                proposed.push(
                  ...output.payload.value.map((entity) => ({
                    ...entity,
                    researchOngoing: false,
                  })),
                );
              } else {
                proposed.push({
                  ...output.payload.value,
                  researchOngoing: false,
                });
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
              break;
            case "EntityId":
              if (
                output.outputName ===
                ("highlightedEntities" satisfies OutputNameForAiFlowAction<"researchEntities">)
              ) {
                if (Array.isArray(output.payload.value)) {
                  highlightedEntityIds.push(...output.payload.value);
                } else {
                  highlightedEntityIds.push(output.payload.value);
                }
              }
              break;
          }
        }
      }

      if (selectedFlowRun.closedAt) {
        progressLogs.push({
          level: 1,
          message: `Flow run closed: ${selectedFlowRun.failureMessage?.toLowerCase() ?? selectedFlowRun.status.toLowerCase()}`,
          recordedAt: selectedFlowRun.closedAt,
          stepId: "closure",
          type: "StateChange",
        });
      }

      return {
        logs: progressLogs,
        proposedEntities: proposed,
        persistedEntities: persisted,
        relevantEntityIds: highlightedEntityIds,
      };
    }, [logDisplay, selectedFlowRun]);

  const [startFlow] = useMutation<
    StartFlowMutation,
    StartFlowMutationVariables
  >(startFlowMutation);

  const runFlow = useCallback(
    async (
      args: { outputs: FlowTrigger["outputs"]; webId: WebId } | { reRun: true },
    ) => {
      let flowInputs: FlowInputs[number];

      if (!selectedFlowDefinition) {
        throw new Error("Can't start flow with no flow definition selected");
      }

      if ("reRun" in args) {
        if (!selectedFlowRun) {
          throw new Error("Can't re-run flow with no flow run selected");
        }

        const { inputs } = selectedFlowRun;
        flowInputs = inputs[0];
      } else {
        const { webId, outputs } = args;
        flowInputs = {
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
        };
      }

      const { data } = await startFlow({
        variables: flowInputs,
      });

      const flowRunId = data?.startFlow;
      if (!flowRunId) {
        throw new Error("Failed to start flow");
      }

      await apolloClient.refetchQueries({
        include: ["getFlowRuns"],
      });

      setShowRunModal(false);

      const { shortname } = getOwner({ webId: flowInputs.webId });

      void push(generateWorkerRunPath({ shortname, flowRunId }));
    },
    [
      apolloClient,
      getOwner,
      push,
      selectedFlowDefinition,
      selectedFlowRun,
      startFlow,
    ],
  );

  const handleRunFlowClicked = useCallback(async () => {
    if (selectedFlowRun) {
      await runFlow({ reRun: true });
      return;
    }
    setShowRunModal(true);
  }, [runFlow, selectedFlowRun]);

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

  const isGoal = goalFlowDefinitionIds.includes(
    selectedFlowDefinition.flowDefinitionId,
  );

  return (
    <>
      {selectedFlowRun && (
        <DagSlide
          groups={flowMaybeGrouped.groups}
          open={showDag}
          onClose={() => setShowDag(false)}
          selectedFlowDefinition={selectedFlowDefinition}
        />
      )}
      <Stack sx={{ height: containerHeight }}>
        {isRunnableFromHere && (
          <RunFlowModal
            key={selectedFlowDefinition.name}
            flowDefinition={selectedFlowDefinition}
            open={showRunModal}
            onClose={() => setShowRunModal(false)}
            runFlow={async (outputs: FlowTrigger["outputs"], webId) => {
              await runFlow({ outputs, webId });
            }}
          />
        )}
        <Box sx={{ background: ({ palette }) => palette.gray[5] }}>
          <Topbar
            handleRunFlowClicked={handleRunFlowClicked}
            showRunButton={isRunnableFromHere}
            workerType={isGoal ? "goal" : "flow"}
          />
        </Box>
        <Stack
          direction="row"
          sx={{
            flex: 1,
            minHeight: `calc(100% - ${logHeight + topbarHeight}px)`,
            overflow: "auto",
            width: "100%",
            background: ({ palette }) =>
              selectedFlowRun ? palette.gray[10] : "rgb(241, 246, 251)",
            transition: ({ transitions }) =>
              transitions.create("background", transitionOptions),
            pt: 2.5,
          }}
        >
          {selectedFlowRun ? (
            <FlowRunSidebar
              flowDefinition={selectedFlowDefinition}
              flowRunId={selectedFlowRun.flowRunId}
              groups={flowMaybeGrouped.groups}
              name={selectedFlowRun.name}
              showDag={() => setShowDag(true)}
            />
          ) : null}
          <Stack
            sx={{
              height: "100%",
              pb: 2.5,
              px: 3,
              width: "100%",
            }}
          >
            <SectionLabel text={selectedFlowRun ? "outputs" : "definition"} />
            {selectedFlowRun ? (
              <Outputs
                key={`${flowRunStateKey}-outputs`}
                persistedEntities={persistedEntities}
                proposedEntities={proposedEntities}
                relevantEntityIds={relevantEntityIds}
              />
            ) : (
              <DAG
                key={flowDefinitionStateKey}
                groups={flowMaybeGrouped.groups}
                selectedFlowDefinition={selectedFlowDefinition}
              />
            )}
          </Stack>
        </Stack>

        <Collapse
          collapsedSize={45}
          in={!bottomPanelIsCollapsed}
          sx={{ maxHeight: "40%" }}
        >
          <Stack
            direction="row"
            justifyContent="space-between"
            sx={({ palette, transitions }) => ({
              background: bottomPanelIsCollapsed
                ? palette.common.white
                : palette.gray[10],
              borderTop: `2px solid ${palette.gray[20]}`,
              height: logHeight,
              maxHeight: "100%",
              maxWidth: "100%",
              px: 3,
              transition: transitions.create("background", transitionOptions),
              width: "100%",
            })}
          >
            <Fade in={!bottomPanelIsCollapsed}>
              <Stack
                sx={{
                  borderRight: ({ palette }) => `1px solid ${palette.gray[20]}`,
                  height: "100%",
                  py: 2.5,
                  pr: 3,
                  width: "70%",
                }}
              >
                <ActivityLog
                  key={`${flowRunStateKey}-activity-log`}
                  logs={logs}
                  logDisplay={logDisplay}
                  setLogDisplay={setLogDisplay}
                />
              </Stack>
            </Fade>
            <Box py={0.5}>
              <IconButton
                aria-hidden
                size="medium"
                sx={({ palette }) => ({
                  transform: `rotate(${bottomPanelIsCollapsed ? "90deg" : "270deg"})`,

                  "&:hover": {
                    backgroundColor: palette.gray[20],
                    color: palette.gray[60],
                  },
                })}
                onClick={() =>
                  setBottomPanelIsCollapsed(!bottomPanelIsCollapsed)
                }
              >
                <ArrowRightToLineIcon />
              </IconButton>
            </Box>
          </Stack>
        </Collapse>
      </Stack>
    </>
  );
};
