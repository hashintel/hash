import {
  getStorageProvider,
  prepareOutputPayload,
  resolveInputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { filterList } from "./filter-action/filter-values.js";
import { getConditionContext } from "./filter-action/get-condition-context.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

export const filterListAction: FlowActionActivity<"filterList"> = async ({
  inputs,
}) => {
  const { items, condition } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "filterList",
  });

  const { runId, stepId, userAuthentication, workflowId } =
    await getFlowContext();

  const storageProvider = getStorageProvider();

  const resolvedItems = await resolveInputPayload(
    { storageProvider, workflowId },
    items,
  );

  const result = filterList(
    resolvedItems,
    condition,
    await getConditionContext({
      authentication: userAuthentication,
      condition,
      kind: resolvedItems.kind,
      values: resolvedItems.value,
    }),
  );

  if (result.status === "error") {
    return {
      code:
        result.code === "entityRequired"
          ? StatusCode.NotFound
          : StatusCode.InvalidArgument,
      message: result.message,
      contents: [],
    };
  }

  const prepareOutput = (outputName: "matching" | "nonMatching") =>
    prepareOutputPayload({
      storageProvider,
      workflowId,
      runId,
      stepId,
      outputName,
      payload: result[outputName],
    });

  const [matching, nonMatching] = await Promise.all([
    prepareOutput("matching"),
    prepareOutput("nonMatching"),
  ]);

  return {
    code: StatusCode.Ok,
    message: `${result.matching.value.length} of ${resolvedItems.value.length} items matched`,
    contents: [
      {
        outputs: [
          { outputName: "matching", payload: matching },
          { outputName: "nonMatching", payload: nonMatching },
        ],
      },
    ],
  };
};
