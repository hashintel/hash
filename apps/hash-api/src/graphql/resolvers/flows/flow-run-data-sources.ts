import { getRecordOfFlowRun } from "./shared/get-record-of-flow-run";

import type { ResolverFn } from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { FlowRunParent } from "./shared/get-record-of-flow-run";
import type { FlowDataSources } from "@local/hash-isomorphic-utils/flows/types";

export const flowRunDataSourcesResolver: ResolverFn<
  FlowDataSources | null,
  FlowRunParent,
  Pick<
    GraphQLContext,
    | "authentication"
    | "dataSources"
    | "flowRunRecords"
    | "runningFlowRunHistories"
    | "temporal"
  >,
  Record<string, never>
> = async (flowRun, _args, context) =>
  (await getRecordOfFlowRun(flowRun, context)).header.dataSources ?? null;
