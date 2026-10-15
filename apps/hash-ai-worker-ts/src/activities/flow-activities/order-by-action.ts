import {
  getStorageProvider,
  prepareOutputPayload,
  resolveInputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { validateSortKey } from "@local/hash-isomorphic-utils/flows/sort-key";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { getConditionContext } from "./filter-action/get-condition-context.js";
import { orderBy } from "./filter-action/order-by.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

export const orderByAction: FlowActionActivity<"orderBy"> = async ({
  inputs,
}) => {
  const { items, sortBy } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "orderBy",
  });

  const { runId, stepId, userAuthentication, workflowId } =
    await getFlowContext();

  const storageProvider = getStorageProvider();

  const resolvedItems = await resolveInputPayload(
    { storageProvider, workflowId },
    items,
  );

  const result = orderBy(
    resolvedItems,
    sortBy,
    await getConditionContext({
      authentication: userAuthentication,
      /* An invalid sort key reads nothing: sorting reports the error. */
      subjects: validateSortKey(sortBy, resolvedItems.kind)
        ? []
        : [sortBy.subject],
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

  const payload = await prepareOutputPayload({
    storageProvider,
    workflowId,
    runId,
    stepId,
    outputName: "items",
    payload: result.items,
  });

  return {
    code: StatusCode.Ok,
    message: `Sorted ${result.items.value.length} items`,
    contents: [{ outputs: [{ outputName: "items", payload }] }],
  };
};
