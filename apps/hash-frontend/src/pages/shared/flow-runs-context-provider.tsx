import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { getInputRequests } from "@local/hash-isomorphic-utils/flows/run-events";
import { getStepRunsFromEvents } from "@local/hash-isomorphic-utils/flows/step-runs";
import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";
import {
  getFlowRunById,
  getFlowRunsQuery,
} from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { FlowRunsContext } from "./flow-runs-context";
import { useFlowRunEvents } from "./use-flow-run-events";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
  GetFlowRunsQuery,
  GetFlowRunsQueryVariables,
} from "../../graphql/api-types.gen";
import type {
  FlowRunsContextType,
  FlowRunsPaginationState,
  SelectedFlowRun,
} from "./flow-runs-context";
import type { EntityId } from "@blockprotocol/type-system";
import type { PropsWithChildren } from "react";

export const FlowRunsContextProvider = ({
  children,
  pagination,
  selectedFlowRunEntityId,
}: PropsWithChildren<{
  pagination?: FlowRunsPaginationState;
  selectedFlowRunEntityId: EntityId | null;
}>) => {
  const variables: GetFlowRunsQueryVariables = pagination
    ? {
        cursor: pagination.currentCursor,
        limit: pagination.rowsPerPage,
      }
    : { limit: flowRunsQueryMaxLimit };

  const { data: flowRunsData, loading: flowRunsLoading } = useQuery<
    GetFlowRunsQuery,
    GetFlowRunsQueryVariables
  >(getFlowRunsQuery, {
    pollInterval: 3_000,
    variables,
  });

  const { data: selectedFlowRunData, loading: selectedFlowRunLoading } =
    useQuery<GetFlowRunByIdQuery, GetFlowRunByIdQueryVariables>(
      getFlowRunById,
      {
        pollInterval: 2_000,
        skip: !selectedFlowRunEntityId,
        variables: selectedFlowRunEntityId
          ? { flowRunEntityId: selectedFlowRunEntityId }
          : undefined,
      },
    );

  const flowRuns = useMemo(() => {
    if (flowRunsData) {
      return flowRunsData.getFlowRuns.flowRuns;
    }
    return [];
  }, [flowRunsData]);

  const totalCount = flowRunsData?.getFlowRuns.totalCount ?? 0;
  const nextCursor = flowRunsData?.getFlowRuns.nextCursor ?? null;

  const selectedFlowRunEvents = useFlowRunEvents({
    flowRunEntityId: selectedFlowRunEntityId,
    live: !selectedFlowRunData?.getFlowRunById.closedAt,
  });

  /* Step runs are built in the browser, and inconsistent events are reported as a failure rather than thrown. */
  const { selectedFlowRun, stepRunsFailure } = useMemo<{
    selectedFlowRun: SelectedFlowRun | null;
    stepRunsFailure: string | null;
  }>(() => {
    if (!selectedFlowRunData || selectedFlowRunEvents.status !== "loaded") {
      return { selectedFlowRun: null, stepRunsFailure: null };
    }

    const flowRun = selectedFlowRunData.getFlowRunById;
    const { events } = selectedFlowRunEvents;

    try {
      return {
        selectedFlowRun: {
          ...flowRun,
          stepRuns: getStepRunsFromEvents(events, flowRun),
          inputRequests: getInputRequests(events),
        },
        stepRunsFailure: null,
      };
    } catch (error) {
      return {
        selectedFlowRun: null,
        stepRunsFailure: error instanceof Error ? error.message : String(error),
      };
    }
  }, [selectedFlowRunData, selectedFlowRunEvents]);

  const selectedFlowRunEventsFailure =
    selectedFlowRunEvents.status === "failed"
      ? selectedFlowRunEvents.message
      : selectedFlowRunEvents.status === "loaded"
        ? (stepRunsFailure ?? selectedFlowRunEvents.checkFailure ?? null)
        : null;

  const context = useMemo<FlowRunsContextType>(
    () => ({
      flowRuns,
      totalCount,
      nextCursor,
      loading:
        selectedFlowRunLoading ||
        (!!selectedFlowRunEntityId &&
          selectedFlowRunEvents.status === "loading") ||
        flowRunsLoading,
      pagination: pagination ?? null,
      selectedFlowRun,
      selectedFlowRunEntityId,
      selectedFlowRunEventsFailure,
    }),
    [
      flowRuns,
      totalCount,
      nextCursor,
      flowRunsLoading,
      pagination,
      selectedFlowRunLoading,
      selectedFlowRunEvents.status,
      selectedFlowRun,
      selectedFlowRunEntityId,
      selectedFlowRunEventsFailure,
    ],
  );

  return (
    <FlowRunsContext.Provider value={context}>
      {children}
    </FlowRunsContext.Provider>
  );
};
