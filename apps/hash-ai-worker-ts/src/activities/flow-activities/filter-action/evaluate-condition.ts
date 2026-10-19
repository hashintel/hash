import { isEntityId } from "@blockprotocol/type-system";
import {
  evaluateFilter,
  hasPrimitiveType,
} from "@local/hash-isomorphic-utils/flows/evaluate-filter";
import {
  isScalarKind,
  scalarKinds,
  validateCondition,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import { payloadKindTraits } from "@local/hash-isomorphic-utils/flows/types";

import type { EntityId, VersionedUrl } from "@blockprotocol/type-system";
import type {
  ConditionError,
  ConditionNode,
  ConditionSubject,
  FilterCondition,
  FilterLeaf,
} from "@local/hash-isomorphic-utils/flows/filter-condition";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

/** The caller resolves entities with the requesting actor's permissions. */
export type ConditionEntity = {
  properties: Readonly<Record<string, unknown>>;
  entityTypeIds: readonly VersionedUrl[];
};

export type ConditionContext = {
  entities?: ReadonlyMap<EntityId, ConditionEntity>;
};

export type ConditionInput = { kind: PayloadKind; value: unknown };

export type ConditionResult =
  | { status: "success"; matches: boolean }
  | ConditionError;

/** Whether a value counts as missing: Filter treats it as empty, and Read entity gives no output for it. */
export const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

const ownProperty = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

/**
 * Reads a subject's value from an input: the input itself, one of its fields, or a property of the entity it is or
 * names, which must be in `context`. A multi-valued property is returned as an array.
 */
export const resolveSubject = (
  subject: ConditionSubject,
  input: ConditionInput,
  context: ConditionContext,
): { status: "success"; value: unknown } | ConditionError => {
  if (subject.kind === "input") {
    return { status: "success", value: input.value };
  }
  if (subject.kind === "field") {
    let value = input.value;
    for (const segment of subject.path) {
      value = ownProperty(value, segment);
    }
    return { status: "success", value };
  }
  if (isEmptyValue(input.value)) {
    return { status: "success", value: undefined };
  }
  let entity: unknown = input.value;
  if (input.kind === "EntityId") {
    if (typeof input.value !== "string") {
      return {
        status: "error",
        code: "invalidValue",
        message: "EntityId must be a string.",
      };
    }
    if (!isEntityId(input.value)) {
      return {
        status: "error",
        code: "invalidValue",
        message: `${input.value} is not a valid EntityId.`,
      };
    }
    entity = context.entities?.get(input.value);
    if (!entity) {
      return {
        status: "error",
        code: "entityRequired",
        message: `Entity ${input.value} wasn't found or you don't have access to it.`,
      };
    }
  }
  const properties = ownProperty(entity, "properties");
  const entityTypeIds = ownProperty(entity, "entityTypeIds");
  if (
    typeof properties !== "object" ||
    properties === null ||
    Array.isArray(properties) ||
    !Array.isArray(entityTypeIds) ||
    !entityTypeIds.every((typeId: unknown) => typeof typeId === "string")
  ) {
    return {
      status: "error",
      code: "invalidValue",
      message: "An entity must have properties and entity type IDs.",
    };
  }
  return {
    status: "success",
    value:
      subject.kind === "entityType"
        ? entityTypeIds
        : ownProperty(properties, subject.propertyTypeBaseUrl),
  };
};

const asScalarValue = (kind: PayloadKind, value: unknown) =>
  isScalarKind(kind) &&
  hasPrimitiveType(payloadKindTraits[kind].primitive, value)
    ? { kind, value }
    : undefined;

const evaluateLeaf = (
  leaf: FilterLeaf,
  input: ConditionInput,
  context: ConditionContext,
): ConditionResult => {
  if (leaf.operator === "notEquals") {
    const result = evaluateLeaf(
      { ...leaf, operator: "equals" },
      input,
      context,
    );
    return result.status === "error"
      ? result
      : { status: "success", matches: !result.matches };
  }
  const resolved = resolveSubject(leaf.subject, input, context);
  if (resolved.status === "error") {
    return resolved;
  }
  const values: unknown[] = Array.isArray(resolved.value)
    ? resolved.value
    : [resolved.value];
  const presentValues = values.filter((item) => !isEmptyValue(item));
  const present = presentValues.length > 0;
  const isPresence =
    leaf.operator === "isEmpty" || leaf.operator === "isNotEmpty";
  if (leaf.subject.kind === "entityType") {
    return {
      status: "success",
      matches: isPresence
        ? present === (leaf.operator === "isNotEmpty")
        : presentValues.includes(leaf.value?.value),
    };
  }
  if (leaf.operator === "isOfType") {
    return {
      status: "error",
      code: "invalidCondition",
      message: "isOfType requires an entity type subject.",
    };
  }
  if (!present) {
    return { status: "success", matches: leaf.operator === "isEmpty" };
  }
  if (isPresence && !scalarKinds.includes(leaf.subject.payloadKind)) {
    return { status: "success", matches: leaf.operator === "isNotEmpty" };
  }
  let matches = false;
  for (const item of presentValues) {
    const scalar = asScalarValue(leaf.subject.payloadKind, item);
    if (!scalar) {
      return {
        status: "error",
        code: "invalidValue",
        message: `Subject value does not have kind ${leaf.subject.payloadKind}.`,
      };
    }
    // Presence operators still validate nonempty scalar data, including dates and finite numbers.
    const result = evaluateFilter({
      value: scalar,
      condition: { operator: leaf.operator, operand: leaf.value?.value },
    });
    if (result.status === "error") {
      return result;
    }
    matches = matches || result.branch === "matched";
  }
  return { status: "success", matches };
};

/** Callers must run validateCondition first; exported only for filterList. */
export const evaluateValidatedCondition = (
  node: ConditionNode,
  input: ConditionInput,
  context: ConditionContext = {},
): ConditionResult => {
  if (node.kind === "condition") {
    return evaluateLeaf(node, input, context);
  }
  if (node.kind === "not") {
    const result = evaluateValidatedCondition(node.condition, input, context);
    return result.status === "error"
      ? result
      : { status: "success", matches: !result.matches };
  }
  const results: boolean[] = [];
  for (const child of node.conditions) {
    const result = evaluateValidatedCondition(child, input, context);
    if (result.status === "error") {
      return result;
    }
    results.push(result.matches);
  }
  return {
    status: "success",
    matches:
      node.kind === "any" ? results.some(Boolean) : results.every(Boolean),
  };
};

/**
 * Pure evaluation over resolved values. Errors stay distinct from false.
 * Missing, null, empty text and arrays without a non-empty element are empty;
 * zero, false, whitespace and empty objects are present. A multi-valued
 * subject matches if any element matches. notEquals is the negation of equals,
 * so it matches empty values and fails if any element is equal. Every
 * child/element is checked so `any` cannot hide bad data, and errors are never
 * negated into a match.
 * Entity type membership is exact (including version), not an ancestry lookup.
 */
export const evaluateCondition = (
  condition: FilterCondition,
  input: ConditionInput,
  context: ConditionContext = {},
): ConditionResult =>
  validateCondition(condition, input.kind) ??
  evaluateValidatedCondition(condition, input, context);
