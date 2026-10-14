import {
  getStorageProvider,
  prepareOutputPayload,
  resolveInputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { validateAggregation } from "@local/hash-isomorphic-utils/flows/aggregation";
import { getArrayPayloadLength } from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { aggregate } from "./filter-action/aggregate.js";
import { getConditionContext } from "./filter-action/get-condition-context.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

export const aggregateAction: FlowActionActivity<"aggregate"> = async ({
  inputs,
}) => {
  const { items, aggregation } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "aggregate",
  });

  /* Checked first, so that an invalid aggregation reads nothing. */
  const aggregationError = validateAggregation(aggregation, items.kind);

  if (aggregationError) {
    return {
      code: StatusCode.InvalidArgument,
      message: aggregationError.message,
      contents: [],
    };
  }

  const { runId, stepId, userAuthentication, workflowId } =
    await getFlowContext();

  const storageProvider = getStorageProvider();

  let result: number | undefined;

  if (aggregation.operation === "count") {
    /* A stored reference records its length, so a list is counted without fetching it. */
    result = getArrayPayloadLength(items.value);
  } else {
    const resolvedItems = await resolveInputPayload(
      { storageProvider, workflowId },
      items,
    );

    const aggregated = aggregate(
      resolvedItems,
      aggregation,
      await getConditionContext({
        authentication: userAuthentication,
        subjects: [aggregation.subject],
        kind: resolvedItems.kind,
        values: resolvedItems.value,
      }),
    );

    if (aggregated.status === "error") {
      return {
        code:
          aggregated.code === "entityRequired"
            ? StatusCode.NotFound
            : StatusCode.InvalidArgument,
        message: aggregated.message,
        contents: [],
      };
    }

    result = aggregated.result;
  }

  /* Without a result, `result` is missing: steps that read it with `whenMissing: "skip"` are skipped. */
  if (result === undefined) {
    return {
      code: StatusCode.Ok,
      message: "None of the items had a value to aggregate",
      contents: [{ outputs: [] }],
    };
  }

  const payload = await prepareOutputPayload({
    storageProvider,
    workflowId,
    runId,
    stepId,
    outputName: "result",
    payload: { kind: "Number", value: result },
  });

  return {
    code: StatusCode.Ok,
    message: `The ${aggregation.operation} is ${result}`,
    contents: [{ outputs: [{ outputName: "result", payload }] }],
  };
};
