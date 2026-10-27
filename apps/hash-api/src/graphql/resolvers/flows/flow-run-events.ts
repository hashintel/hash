import {
  pageFlowRunEvents,
  resolveStoredPayloadsInEvents,
} from "@local/hash-backend-utils/flows/run-events";

import * as Error from "../../error";
import { getRecordOfFlowRun } from "./shared/get-record-of-flow-run";

import type {
  FlowRun,
  FlowRunEventsArgs,
  ResolverFn,
  ResolversTypes,
} from "../../api-types.gen";
import type { GraphQLContext } from "../../context";
import type { SparseFlowRun } from "@local/hash-isomorphic-utils/flows/types";

export const flowRunEventsResolver: ResolverFn<
  ResolversTypes["FlowRunEventsPage"],
  FlowRun | SparseFlowRun,
  Pick<
    GraphQLContext,
    "authentication" | "dataSources" | "flowRunRecords" | "temporal"
  >,
  FlowRunEventsArgs
> = async (flowRun, { after, first }, context) => {
  const { header, events } = await getRecordOfFlowRun(flowRun, context);

  let page: ReturnType<typeof pageFlowRunEvents>;
  try {
    page = pageFlowRunEvents({ events, runId: header.runId, after, first });
  } catch (error) {
    throw Error.badRequest((error as Error).message);
  }

  return {
    ...page,
    events: await resolveStoredPayloadsInEvents(page.events, {
      storageProvider: context.dataSources.uploadProvider,
      workflowId: header.workflowId,
    }),
  };
};
