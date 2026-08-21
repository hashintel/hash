import { useQuery } from "@apollo/client";
import { useMemo } from "react";

import { flowRunsQueryMaxLimit } from "@local/hash-isomorphic-utils/flows/types";
import {
  getFlowRunById,
  getFlowRunsQuery,
} from "@local/hash-isomorphic-utils/graphql/queries/flow.queries";

import { FlowRunsContext } from "./flow-runs-context";

import type {
  GetFlowRunByIdQuery,
  GetFlowRunByIdQueryVariables,
  GetFlowRunsQuery,
  GetFlowRunsQueryVariables,
} from "../../graphql/api-types.gen";
import type {
  FlowRunsContextType,
  FlowRunsPaginationState,
} from "./flow-runs-context";
import type { PropsWithChildren } from "react";

export const FlowRunsContextProvider = ({
  children,
  pagination,
  selectedFlowRunId,
}: PropsWithChildren<{
  pagination?: FlowRunsPaginationState;
  selectedFlowRunId: string | null;
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
        skip: !selectedFlowRunId,
        variables: {
          flowRunId: selectedFlowRunId ?? "",
        },
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

  const selectedFlowRun = useMemo(() => {
    if (selectedFlowRunData) {
      return selectedFlowRunData.getFlowRunById;
    }
    return null;
  }, [selectedFlowRunData]);

  const context = useMemo<FlowRunsContextType>(
    () => ({
      flowRuns,
      totalCount,
      nextCursor,
      loading: selectedFlowRunLoading || flowRunsLoading,
      pagination: pagination ?? null,
      selectedFlowRun,
      selectedFlowRunId,
    }),
    [
      flowRuns,
      totalCount,
      nextCursor,
      flowRunsLoading,
      pagination,
      selectedFlowRunLoading,
      selectedFlowRun,
      selectedFlowRunId,
    ],
  );

  return (
    <FlowRunsContext.Provider value={context}>
      {children}
    </FlowRunsContext.Provider>
  );
};
