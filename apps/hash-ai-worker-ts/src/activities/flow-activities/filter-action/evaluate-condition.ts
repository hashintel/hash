import { evaluateFilter } from "./evaluate-filter.js";

import type {
  FilterResult,
  FilterValue,
  ScalarFilterCondition,
} from "./evaluate-filter.js";
import type {
  BaseUrl,
  EntityId,
  VersionedUrl,
} from "@blockprotocol/type-system";
import type { PayloadKind } from "@local/hash-isomorphic-utils/flows/types";

export type ConditionSubject =
  | { kind: "input"; payloadKind: PayloadKind }
  | { kind: "field"; path: readonly string[]; payloadKind: PayloadKind }
  | {
      kind: "entityProperty";
      propertyTypeBaseUrl: BaseUrl;
      payloadKind: PayloadKind;
    }
  | { kind: "entityType" };

export type ConstantPayload =
  | FilterValue
  | { kind: "VersionedUrl"; value: VersionedUrl };

export type FilterLeaf = {
  kind: "condition";
  subject: ConditionSubject;
  operator: ScalarFilterCondition["operator"] | "isOfType";
  value?: ConstantPayload;
};

export type FilterGroup = {
  kind: "group";
  combinator: "and" | "or";
  conditions: readonly (FilterLeaf | FilterGroup)[];
};

/** The top level is always a group. Nested groups evaluate but are rejected by validation for now. */
export type FilterCondition = FilterGroup;

/** The caller resolves entities with the requesting actor's permissions. */
export type ConditionEntity = {
  properties: Readonly<Record<string, unknown>>;
  entityTypeIds: readonly VersionedUrl[];
};

export type ConditionContext = {
  entities?: ReadonlyMap<EntityId, ConditionEntity>;
};

export type ConditionInput = { kind: PayloadKind; value: unknown };

export type ConditionError =
  | Extract<FilterResult, { status: "error" }>
  | {
      status: "error";
      code: "invalidCondition" | "entityRequired";
      message: string;
    };

export type ConditionResult =
  | { status: "success"; matches: boolean }
  | ConditionError;

const invalidCondition = (message: string): ConditionError => ({
  status: "error",
  code: "invalidCondition",
  message,
});

const scalarOperators: readonly string[] = [
  "equals",
  "notEquals",
  "contains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
];

const entityKinds: readonly PayloadKind[] = [
  "EntityId",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
];

const scalarKinds: readonly PayloadKind[] = [
  "Text",
  "Number",
  "Boolean",
  "Date",
  "EntityId",
];

const objectKinds: readonly PayloadKind[] = [
  "FormattedText",
  "GoogleSheet",
  "PersistedEntitiesMetadata",
  "PersistedEntityMetadata",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
  "WebPage",
  "WebSearchResult",
];

/** Definition-time checks are also run at the core boundary, including for empty lists. */
export const validateCondition = (
  condition: FilterCondition,
  inputKind: PayloadKind,
): ConditionError | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may contain a bare leaf.
  if (condition.kind !== "group") {
    return invalidCondition("The top-level condition must be a group.");
  }
  if (
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Reject unsupported combinators from persisted definitions.
    (condition.combinator !== "and" && condition.combinator !== "or") ||
    condition.conditions.length === 0
  ) {
    return invalidCondition(
      "A group requires AND or OR and at least one condition.",
    );
  }
  for (const leaf of condition.conditions) {
    if (leaf.kind !== "condition") {
      return invalidCondition("Nested condition groups are not supported.");
    }
    const { subject, operator, value } = leaf;
    if (subject.kind === "input" && subject.payloadKind !== inputKind) {
      return invalidCondition(
        "The input subject kind must match the input payload kind.",
      );
    }
    if (
      subject.kind === "field" &&
      (!objectKinds.includes(inputKind) ||
        subject.path.length === 0 ||
        subject.path.some(
          (segment) =>
            !segment ||
            ["__proto__", "constructor", "prototype"].includes(segment),
        ))
    ) {
      return invalidCondition(
        "A field subject requires an object input and nonempty, safe own-property names.",
      );
    }
    if (
      (subject.kind === "entityProperty" || subject.kind === "entityType") &&
      !entityKinds.includes(inputKind)
    ) {
      return invalidCondition(
        "Entity subjects require an EntityId or proposed entity input.",
      );
    }
    if (operator === "isEmpty" || operator === "isNotEmpty") {
      if (value !== undefined) {
        return invalidCondition(
          "Presence operators do not accept a comparison value.",
        );
      }
      continue;
    }
    if (subject.kind === "entityType") {
      if (
        operator !== "isOfType" ||
        value?.kind !== "VersionedUrl" ||
        !/^https?:\/\/.+\/v\/[1-9]\d*$/.test(value.value)
      ) {
        return invalidCondition(
          "Entity type conditions require isOfType and a versioned type URL.",
        );
      }
      continue;
    }
    if (
      operator === "isOfType" ||
      !scalarOperators.includes(operator) ||
      !value ||
      value.kind !== subject.payloadKind ||
      value.kind === "VersionedUrl"
    ) {
      return invalidCondition(
        "A scalar operator requires a comparison value of the subject's payload kind.",
      );
    }
    const validation = evaluateFilter({
      value,
      condition: { operator, operand: value.value },
    });
    if (validation.status === "error") {
      return invalidCondition(validation.message);
    }
  }
  return undefined;
};

const ownProperty = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null && Object.hasOwn(value, key)
    ? (value as Record<string, unknown>)[key]
    : undefined;

const resolveSubject = (
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
  if (input.value === undefined || input.value === null || input.value === "") {
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
    entity = context.entities?.get(input.value as EntityId);
    if (!entity) {
      return {
        status: "error",
        code: "entityRequired",
        message:
          "Resolve the entity with the caller's permissions before evaluating its properties or types.",
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

const asScalarValue = (
  kind: PayloadKind,
  value: unknown,
): FilterValue | undefined => {
  switch (kind) {
    case "Text":
    case "Date":
      return typeof value === "string" ? { kind, value } : undefined;
    case "Number":
      return typeof value === "number" ? { kind, value } : undefined;
    case "Boolean":
      return typeof value === "boolean" ? { kind, value } : undefined;
    case "EntityId":
      return typeof value === "string"
        ? { kind, value: value as EntityId }
        : undefined;
    default:
      return undefined;
  }
};

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
  const value = resolved.value;
  const empty =
    value === undefined ||
    value === null ||
    value === "" ||
    (Array.isArray(value) && value.length === 0);
  const isPresence =
    leaf.operator === "isEmpty" || leaf.operator === "isNotEmpty";
  if (empty) {
    return { status: "success", matches: leaf.operator === "isEmpty" };
  }
  if (leaf.subject.kind === "entityType") {
    return {
      status: "success",
      matches: isPresence
        ? leaf.operator === "isNotEmpty"
        : Array.isArray(value) && value.includes(leaf.value?.value),
    };
  }
  if (isPresence && !scalarKinds.includes(leaf.subject.payloadKind)) {
    return { status: "success", matches: leaf.operator === "isNotEmpty" };
  }
  const values: unknown[] = Array.isArray(value) ? value : [value];
  let matches = false;
  for (const item of values) {
    if (item === undefined || item === null || item === "") {
      continue;
    }
    const scalar = asScalarValue(leaf.subject.payloadKind, item);
    if (!scalar) {
      return {
        status: "error",
        code: "invalidValue",
        message: `Subject value does not have kind ${leaf.subject.payloadKind}.`,
      };
    }
    if (leaf.operator === "isOfType") {
      return invalidCondition("isOfType requires an entity type subject.");
    }
    const result = evaluateFilter({
      value: scalar,
      // Presence still validates nonempty scalar data, including dates and finite numbers.
      condition: isPresence
        ? { operator: "equals", operand: scalar.value }
        : { operator: leaf.operator, operand: leaf.value?.value },
    });
    if (result.status === "error") {
      return result;
    }
    matches = matches || result.branch === "matched";
  }
  return {
    status: "success",
    matches: isPresence ? leaf.operator === "isNotEmpty" : matches,
  };
};

/** Callers must run validateCondition first; exported only for filterList. */
export const evaluateValidatedCondition = (
  condition: FilterLeaf | FilterGroup,
  input: ConditionInput,
  context: ConditionContext = {},
): ConditionResult => {
  if (condition.kind === "condition") {
    return evaluateLeaf(condition, input, context);
  }
  const results: boolean[] = [];
  for (const child of condition.conditions) {
    const result = evaluateValidatedCondition(child, input, context);
    if (result.status === "error") {
      return result;
    }
    results.push(result.matches);
  }
  return {
    status: "success",
    matches:
      condition.combinator === "or"
        ? results.some(Boolean)
        : results.every(Boolean),
  };
};

/**
 * Pure evaluation over resolved values. Errors stay distinct from false.
 * Missing, null, empty text and empty arrays are empty; zero, false,
 * whitespace and empty objects are present. A multi-valued subject matches if
 * any element matches. notEquals is the negation of equals, so it matches empty
 * values and fails if any element is equal. Every child/element is checked so
 * OR cannot hide bad data, and errors are never negated into a match.
 * Entity type membership is exact (including version), not an ancestry lookup.
 */
export const evaluateCondition = (
  condition: FilterCondition,
  input: ConditionInput,
  context: ConditionContext = {},
): ConditionResult =>
  validateCondition(condition, input.kind) ??
  evaluateValidatedCondition(condition, input, context);
