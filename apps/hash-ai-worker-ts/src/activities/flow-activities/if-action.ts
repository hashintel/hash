import {
  getStorageProvider,
  resolveInputPayload,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import { evaluateIf } from "./filter-action/filter-values.js";
import {
  getConditionContext,
  getConditionSubjects,
} from "./filter-action/get-condition-context.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";

export const ifAction: FlowActionActivity<"if"> = async ({ inputs }) => {
  const { value, condition } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "if",
  });

  const { userAuthentication, workflowId } = await getFlowContext();

  /* Resolved only to evaluate the condition: the output is the input payload as given, which may be stored. */
  const resolvedValue = await resolveInputPayload(
    { storageProvider: getStorageProvider(), workflowId },
    value,
  );

  const result = evaluateIf(
    resolvedValue,
    condition,
    await getConditionContext({
      authentication: userAuthentication,
      subjects: getConditionSubjects(condition, resolvedValue.kind),
      kind: resolvedValue.kind,
      values: [resolvedValue.value],
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

  return {
    code: StatusCode.Ok,
    contents: [
      { outputs: [{ outputName: result.outputName, payload: value }] },
    ],
  };
};
