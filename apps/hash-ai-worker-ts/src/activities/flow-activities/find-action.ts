import {
  getStorageProvider,
  prepareOutputPayload,
  resolveInputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { find } from "./filter-action/filter-values.js";
import {
  getConditionContext,
  getConditionSubjects,
} from "./filter-action/get-condition-context.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

export const findAction: FlowActionActivity<"find"> = async ({ inputs }) => {
  const { items, condition } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "find",
  });

  const { runId, stepId, userAuthentication, workflowId } =
    await getFlowContext();

  const storageProvider = getStorageProvider();

  const resolvedItems = await resolveInputPayload(
    { storageProvider, workflowId },
    items,
  );

  const result = find(
    resolvedItems,
    condition,
    await getConditionContext({
      authentication: userAuthentication,
      subjects: condition
        ? getConditionSubjects(condition, resolvedItems.kind)
        : [],
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

  /* Without a match, `match` is missing: steps that read it with `whenMissing: "skip"` are skipped. */
  if (!result.match) {
    return {
      code: StatusCode.Ok,
      message: `None of ${resolvedItems.value.length} items matched`,
      contents: [{ outputs: [] }],
    };
  }

  const match = await prepareOutputPayload({
    storageProvider,
    workflowId,
    runId,
    stepId,
    outputName: "match",
    payload: result.match,
  });

  return {
    code: StatusCode.Ok,
    contents: [{ outputs: [{ outputName: "match", payload: match }] }],
  };
};
