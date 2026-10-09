import { validateCondition } from "./evaluate-condition.js";
import { filterList } from "./filter-values.js";

import type {
  ConditionContext,
  ConditionEntity,
  ConditionError,
  FilterCondition,
} from "./evaluate-condition.js";
import type { FilterListPayload } from "./filter-values.js";
import type { EntityId } from "@blockprotocol/type-system";
import type {
  PayloadKind,
  PayloadKindValues,
  StoredPayloadKind,
} from "@local/hash-isomorphic-utils/flows/types";

export type FilterIoError = {
  status: "error";
  code: "entityResolutionFailed" | "storageFailed";
  message: string;
};

/** Must be bound to the requesting actor; never use an unrestricted graph client. */
export type EntityResolver = (entityId: EntityId) => Promise<ConditionEntity>;

export const resolveConditionEntities = async (
  condition: FilterCondition,
  input: { kind: PayloadKind; value: readonly unknown[] },
  resolveEntity: EntityResolver,
): Promise<
  | { status: "success"; context: ConditionContext }
  | ConditionError
  | FilterIoError
> => {
  const error = validateCondition(condition, input.kind);
  if (error) {
    return error;
  }
  const conditions =
    condition.kind === "group" ? condition.conditions : [condition];
  if (
    input.kind !== "EntityId" ||
    !conditions.some(
      ({ subject }) =>
        subject.kind === "entityProperty" || subject.kind === "entityType",
    )
  ) {
    return { status: "success", context: {} };
  }
  const entityIds = new Set<EntityId>();
  for (const value of input.value) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (typeof value !== "string") {
      return {
        status: "error",
        code: "invalidValue",
        message: "EntityId must be a string.",
      };
    }
    entityIds.add(value as EntityId);
  }
  try {
    const entities = await Promise.all(
      [...entityIds].map(
        async (entityId) => [entityId, await resolveEntity(entityId)] as const,
      ),
    );
    return { status: "success", context: { entities: new Map(entities) } };
  } catch {
    return {
      status: "error",
      code: "entityResolutionFailed",
      message: "Could not resolve entities for the condition.",
    };
  }
};

/**
 * Bind to the workflow-scoped payload resolver and writer, not raw S3 access.
 * The reference is opaque so FE-1891 owns its format and access checks. Writers
 * must use distinct, retry-safe keys for the two output names within the run/step.
 */
export type FilterListStorage<Kind extends StoredPayloadKind, Reference> = {
  read: (reference: Reference) => Promise<readonly PayloadKindValues[Kind][]>;
  write: (
    outputName: "matching" | "nonMatching",
    payload: FilterListPayload<Kind>,
  ) => Promise<Reference>;
};

export type StoredFilterListResult<Kind extends StoredPayloadKind, Reference> =
  | {
      status: "success";
      matching: { kind: Kind; value: Reference };
      nonMatching: { kind: Kind; value: Reference };
    }
  | ConditionError
  | FilterIoError;

/** No outputs are exposed until both writes succeed; a failed write is not atomic. */
export const filterStoredList = async <
  Kind extends StoredPayloadKind,
  Reference,
>(
  input: { kind: Kind; value: Reference },
  condition: FilterCondition,
  storage: FilterListStorage<Kind, Reference>,
): Promise<StoredFilterListResult<Kind, Reference>> => {
  const error = validateCondition(condition, input.kind);
  if (error) {
    return error;
  }
  try {
    const values = await storage.read(input.value);
    if (!Array.isArray(values)) {
      return {
        status: "error",
        code: "invalidValue",
        message: "The stored filter input must be an array.",
      };
    }
    const result = filterList({ kind: input.kind, value: values }, condition);
    if (result.status === "error") {
      return result;
    }
    const [matching, nonMatching] = await Promise.all([
      storage.write("matching", result.matching),
      storage.write("nonMatching", result.nonMatching),
    ]);
    return {
      status: "success",
      matching: { kind: input.kind, value: matching },
      nonMatching: { kind: input.kind, value: nonMatching },
    };
  } catch {
    return {
      status: "error",
      code: "storageFailed",
      message: "Could not read or write the filter list payloads.",
    };
  }
};
