import { isEntityId } from "@blockprotocol/type-system";
import {
  getStorageProvider,
  resolvePayloadValue,
} from "@local/hash-backend-utils/flows/payload-storage";
import { getSimplifiedFlowActionInputs } from "@local/hash-isomorphic-utils/flows/action-definitions";
import { isIsoDate } from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import { validateEntityProperty } from "@local/hash-isomorphic-utils/flows/read-entity";
import { StatusCode } from "@local/status";

import { getFlowContext } from "../shared/get-flow-context.js";
import {
  isEmptyValue,
  resolveSubject,
} from "./filter-action/evaluate-condition.js";
import { getConditionContext } from "./filter-action/get-condition-context.js";

import type { FlowActionActivity } from "@local/hash-backend-utils/flows";
import type { FlowActionStepOutput } from "@local/hash-isomorphic-utils/flows/action-definitions";
import type { ReadEntityKind } from "@local/hash-isomorphic-utils/flows/read-entity";

/** How to tell a value of each kind, and how to describe one. */
const readableKinds: Record<
  ReadEntityKind,
  { isOfKind: (value: unknown) => boolean; description: string }
> = {
  Text: {
    isOfKind: (value) => typeof value === "string",
    description: "text",
  },
  Number: {
    isOfKind: (value) => typeof value === "number" && Number.isFinite(value),
    description: "a finite number",
  },
  Boolean: {
    isOfKind: (value) => typeof value === "boolean",
    description: "true or false",
  },
  Date: {
    isOfKind: (value) => typeof value === "string" && isIsoDate(value),
    description: "an ISO calendar date (YYYY-MM-DD)",
  },
};

const invalidArgument = (message: string) => ({
  code: StatusCode.InvalidArgument,
  message,
  contents: [],
});

/**
 * Reads one property of an entity, as the user running the flow, and outputs its value as the kind the step declares.
 * It loads the edition the entity ID names, as Filter does: the draft for an entity ID with a draft ID.
 *
 * Without a value, the step has no output, so steps that read it with `whenMissing: "skip"` are skipped. An entity
 * that is missing or that the user can't read, a property with a list of values, and a value that isn't of the
 * declared kind are errors.
 */
export const readEntityAction: FlowActionActivity<"readEntity"> = async ({
  inputs,
}) => {
  const { entityId, property } = getSimplifiedFlowActionInputs({
    inputs,
    actionType: "readEntity",
  });

  const propertyError = validateEntityProperty(property);

  if (propertyError) {
    return invalidArgument(propertyError);
  }

  const { userAuthentication, workflowId } = await getFlowContext();

  /* An item of a stored list of entity IDs, e.g. in a for-each step, is a reference to it. */
  const resolvedEntityId = await resolvePayloadValue(
    { storageProvider: getStorageProvider(), workflowId },
    "EntityId",
    entityId,
  );

  /* Checked here, as Filter treats an empty entity ID as having no properties, rather than as an error. */
  if (!isEntityId(resolvedEntityId)) {
    return invalidArgument(
      `${String(resolvedEntityId)} is not a valid EntityId.`,
    );
  }

  const resolved = resolveSubject(
    property,
    { kind: "EntityId", value: resolvedEntityId },
    await getConditionContext({
      authentication: userAuthentication,
      subjects: [property],
      kind: "EntityId",
      values: [resolvedEntityId],
    }),
  );

  if (resolved.status === "error") {
    return {
      code:
        resolved.code === "entityRequired"
          ? StatusCode.NotFound
          : StatusCode.InvalidArgument,
      message: resolved.message,
      contents: [],
    };
  }

  const { value } = resolved;
  const { propertyTypeBaseUrl, payloadKind } = property;

  if (Array.isArray(value)) {
    return invalidArgument(
      `Property ${propertyTypeBaseUrl} of entity ${resolvedEntityId} has a list of values, but only a single value can be read.`,
    );
  }

  if (isEmptyValue(value)) {
    return {
      code: StatusCode.Ok,
      message: `Entity ${resolvedEntityId} has no value for property ${propertyTypeBaseUrl}`,
      contents: [{ outputs: [] }],
    };
  }

  const { isOfKind, description } = readableKinds[payloadKind];

  if (!isOfKind(value)) {
    return invalidArgument(
      `Property ${propertyTypeBaseUrl} of entity ${resolvedEntityId} is read as ${payloadKind}, but its value ${JSON.stringify(value)} isn't ${description}.`,
    );
  }

  return {
    code: StatusCode.Ok,
    contents: [
      {
        outputs: [
          {
            outputName: "value",
            /* `isOfKind` checked that the value has the declared kind. */
            payload: {
              kind: payloadKind,
              value,
            } as FlowActionStepOutput<"readEntity">["payload"],
          },
        ],
      },
    ],
  };
};
