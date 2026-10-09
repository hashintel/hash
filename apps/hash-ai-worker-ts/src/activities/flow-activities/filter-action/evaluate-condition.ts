import { binaryFilterOperators, evaluateFilter } from "./evaluate-filter.js";

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

/**
 * A boolean tree of leaf conditions. `not` is plain logical negation of its
 * child's result, so it matches wherever the child does not, including missing
 * values: `not(greaterThan 8)` matches a missing score whereas
 * `lessThanOrEqual 8` does not. Errors are never negated.
 */
export type ConditionNode =
  | FilterLeaf
  | { kind: "all"; conditions: readonly ConditionNode[] }
  | { kind: "any"; conditions: readonly ConditionNode[] }
  | { kind: "not"; condition: ConditionNode };

/** The root is always a group; a single condition is a group of one. */
export type FilterCondition = Extract<ConditionNode, { kind: "all" | "any" }>;

/** Every node counts one level, including the root (depth 1), `not` and leaves. */
export const maxConditionDepth = 4;
export const maxConditionLeaves = 50;

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

const scalarOperators: readonly string[] = binaryFilterOperators;

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

/**
 * The leaves of a tree in document order. Call it only on a condition that
 * passed validateCondition: unlike the validators, it throws on malformed nodes.
 */
export const conditionLeaves = (node: ConditionNode): FilterLeaf[] => {
  switch (node.kind) {
    case "condition":
      return [node];
    case "not":
      return conditionLeaves(node.condition);
    case "all":
    case "any":
      return node.conditions.flatMap((child) => conditionLeaves(child));
  }
};

const validateStructure = (
  node: ConditionNode,
  depth: number,
): ConditionError | undefined => {
  if (depth > maxConditionDepth) {
    return invalidCondition(
      `Conditions can be nested at most ${maxConditionDepth} levels deep.`,
    );
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
  if (typeof node !== "object" || node === null) {
    return invalidCondition("A condition must be an object.");
  }
  switch (node.kind) {
    case "condition": {
      const { subject } = node;
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
      if (typeof subject !== "object" || subject === null) {
        return invalidCondition("A condition's subject must be an object.");
      }
      if (
        subject.kind === "field" &&
        (!Array.isArray(subject.path) ||
          subject.path.some((segment) => typeof segment !== "string"))
      ) {
        return invalidCondition(
          "A field subject's path must be an array of strings.",
        );
      }
      return undefined;
    }
    case "not":
      return validateStructure(node.condition, depth + 1);
    case "all":
    case "any": {
      // Narrowing `children` with Array.isArray would turn it into `any[]`.
      const children = node.conditions;
      if (!Array.isArray(node.conditions)) {
        return invalidCondition("A group's conditions must be an array.");
      }
      if (children.length === 0) {
        return invalidCondition("A group requires at least one condition.");
      }
      for (const child of children) {
        const error = validateStructure(child, depth + 1);
        if (error) {
          return error;
        }
      }
      return undefined;
    }
    default:
      return invalidCondition("Unknown condition kind.");
  }
};

const validateLeaf = (
  { subject, operator, value }: FilterLeaf,
  inputKind: PayloadKind,
): ConditionError | undefined => {
  switch (subject.kind) {
    case "input":
      if (subject.payloadKind !== inputKind) {
        return invalidCondition(
          "The input subject kind must match the input payload kind.",
        );
      }
      break;
    case "field":
      if (
        !objectKinds.includes(inputKind) ||
        subject.path.length === 0 ||
        subject.path.some(
          (segment) =>
            !segment ||
            ["__proto__", "constructor", "prototype"].includes(segment),
        )
      ) {
        return invalidCondition(
          "A field subject requires an object input and nonempty, safe own-property names.",
        );
      }
      break;
    case "entityProperty":
    case "entityType":
      if (!entityKinds.includes(inputKind)) {
        return invalidCondition(
          "Entity subjects require an EntityId or proposed entity input.",
        );
      }
      break;
    default:
      return invalidCondition("Unknown subject kind.");
  }
  if (operator === "isEmpty" || operator === "isNotEmpty") {
    if (value !== undefined) {
      return invalidCondition(
        "Presence operators do not accept a comparison value.",
      );
    }
    return undefined;
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
    return undefined;
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
  return validation.status === "error"
    ? invalidCondition(validation.message)
    : undefined;
};

/** Definition-time checks of the whole tree, also run at the core boundary, including for empty lists. */
export const validateCondition = (
  condition: FilterCondition,
  inputKind: PayloadKind,
): ConditionError | undefined => {
  const structureError = validateStructure(condition, 1);
  if (structureError) {
    return structureError;
  }
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may contain any node at the root.
  if (condition.kind !== "all" && condition.kind !== "any") {
    return invalidCondition("The top-level condition must be a group.");
  }
  const leaves = conditionLeaves(condition);
  if (leaves.length > maxConditionLeaves) {
    return invalidCondition(
      `A condition can have at most ${maxConditionLeaves} leaf conditions.`,
    );
  }
  for (const leaf of leaves) {
    const error = validateLeaf(leaf, inputKind);
    if (error) {
      return error;
    }
  }
  return undefined;
};

const isEmptyValue = (value: unknown): boolean =>
  value === undefined || value === null || value === "";

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
    return invalidCondition("isOfType requires an entity type subject.");
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
