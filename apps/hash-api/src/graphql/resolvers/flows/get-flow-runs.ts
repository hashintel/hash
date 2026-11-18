import { getFlowRuns } from "@local/hash-backend-utils/flows";
import { FlowRunStatus as RecordedFlowRunStatus } from "@local/hash-isomorphic-utils/graphql/api-types.gen";

import { FlowRunStatus } from "../../api-types.gen";
import { getEndedRecordHeaderOfFlowRun } from "./shared/get-record-of-flow-run";

import type {
  PaginatedFlowRuns,
  QueryGetFlowRunsArgs,
  ResolverFn,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { FlowRunParent } from "./shared/get-record-of-flow-run";

/**
 * A run as its record has it, if its entity says it's running. A run that ended without saving how, e.g. because it
 * was terminated, has its entity corrected. A run that's still running has none of its history read, and one whose
 * record can't be read stays as it is.
 */
const getFlowRunAsRecorded = async (
  flowRun: FlowRunParent,
  context: Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "logger" | "temporal"
  >,
): Promise<FlowRunParent> => {
  if (flowRun.status !== FlowRunStatus.Running) {
    return flowRun;
  }

  try {
    const header = await getEndedRecordHeaderOfFlowRun(flowRun, context);

    return !header || header.status === RecordedFlowRunStatus.Running
      ? flowRun
      : {
          ...flowRun,
          status: header.status,
          closedAt: header.closedAt ?? null,
        };
  } catch (error) {
    context.logger.warn(
      `Could not read the record of running flow run ${flowRun.flowRunEntityId}: ${(error as Error).message}`,
    );

    return flowRun;
  }
};

export const getFlowRunsResolver: ResolverFn<
  PaginatedFlowRuns,
  Record<string, never>,
  GraphQLContext,
  QueryGetFlowRunsArgs
> = async (_parent, args, context) => {
  const { authentication, dataSources } = context;

  const { flowDefinitionEntityIds, executionStatus, cursor, limit } = args;

  const page = await getFlowRuns({
    authentication,
    filters: {
      flowDefinitionEntityIds,
      executionStatus,
      cursor,
      limit,
    },
    graphApiClient: dataSources.graphApi,
  });

  const flowRuns = await Promise.all(
    page.flowRuns.map((flowRun) => getFlowRunAsRecorded(flowRun, context)),
  );
  /* The runs were filtered and counted by the status their entities had before any was corrected. */
  const matching = executionStatus
    ? flowRuns.filter(({ status }) => status === executionStatus)
    : flowRuns;

  return {
    ...page,
    flowRuns: matching,
    totalCount: page.totalCount - (flowRuns.length - matching.length),
  };
};
