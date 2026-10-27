import { getFlowRunEntityById } from "@local/hash-backend-utils/flows";
import { pageFlowRunEvents } from "@local/hash-backend-utils/flows/run-events";
import { getFlowRunRecord } from "@local/hash-backend-utils/flows/run-record";

import * as Error from "../../error";

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
> = async ({ flowRunEntityId }, { after, first }, context) => {
  const flowRunEntity = await getFlowRunEntityById({
    flowRunEntityId,
    graphApiClient: context.dataSources.graphApi,
    userAuthentication: context.authentication,
  });

  if (!flowRunEntity) {
    throw Error.notFound(`Flow run with id ${flowRunEntityId} not found`);
  }

  const { header, events } = await getFlowRunRecord({
    recordsByWorkflowId: context.flowRunRecords,
    storageProvider: context.dataSources.uploadProvider,
    temporalClient: context.temporal,
    workflowId:
      flowRunEntity.properties[
        "https://hash.ai/@h/types/property-type/workflow-id/"
      ],
  });

  try {
    return pageFlowRunEvents({ events, runId: header.runId, after, first });
  } catch (error) {
    throw Error.badRequest((error as Error).message);
  }
};
