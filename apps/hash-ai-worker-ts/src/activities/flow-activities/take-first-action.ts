import {
  getStorageProvider,
  prepareOutputPayload,
  resolveInputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { getArrayPayloadLength } from "@local/hash-isomorphic-utils/flows/stored-payload-refs";
import { validateTakeCount } from "@local/hash-isomorphic-utils/flows/take-count";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { takeFirst } from "./filter-action/take-first.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

export const takeFirstAction: FlowActionActivity<"takeFirst"> = async ({
  inputs,
}) => {
  const { items, count } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "takeFirst",
  });

  /* Checked before anything else, so that an invalid count fails even when the list is short enough to keep whole. */
  const countError = validateTakeCount(count);

  if (countError) {
    return {
      code: StatusCode.InvalidArgument,
      message: countError,
      contents: [],
    };
  }

  const length = getArrayPayloadLength(items.value);

  /* A stored reference records its length, so a list kept whole is passed on as given, without fetching it. */
  if (count >= length) {
    return {
      code: StatusCode.Ok,
      message: `Kept all ${length} items`,
      contents: [{ outputs: [{ outputName: "items", payload: items }] }],
    };
  }

  const { runId, stepId, workflowId } = await getFlowContext();

  const storageProvider = getStorageProvider();

  const result = takeFirst(
    await resolveInputPayload({ storageProvider, workflowId }, items),
    count,
  );

  if (result.status === "error") {
    return {
      code: StatusCode.InvalidArgument,
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
    message: `Kept the first ${count} of ${length} items`,
    contents: [{ outputs: [{ outputName: "items", payload }] }],
  };
};
