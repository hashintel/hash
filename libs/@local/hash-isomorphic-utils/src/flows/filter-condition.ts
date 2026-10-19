import {
  validateBaseUrl,
  validateVersionedUrl,
} from "@blockprotocol/type-system";

import { evaluateFilter } from "./evaluate-filter.js";
import { allPayloadKinds, payloadKindTraits } from "./types.js";

import type {
  BinaryFilterOperator,
  FilterResult,
  FilterValue,
  UnaryFilterOperator,
} from "./evaluate-filter.js";
import type {
  ActionStepCheck,
  KindWithTrait,
  PayloadKind,
  PayloadKindTraits,
  PrimitiveOf,
} from "./types.js";
import type { BaseUrl } from "@blockprotocol/type-system";

type SubjectOfKind<Kind extends PayloadKind> =
  | { kind: "input"; payloadKind: Kind }
  | { kind: "field"; path: readonly string[]; payloadKind: Kind }
  | {
      kind: "entityProperty";
      propertyTypeBaseUrl: BaseUrl;
      payloadKind: Kind;
    };

export type ConditionSubject =
  | SubjectOfKind<PayloadKind>
  | { kind: "entityType" };

/** Compares a subject with a value of its kind, using an operator that kind supports. */
type ComparisonLeaf = {
  [Kind in ScalarKind]: {
    kind: "condition";
    subject: SubjectOfKind<Kind>;
    operator: BinaryFilterOperator<Kind>;
    value: Extract<FilterValue, { kind: Kind }>;
  };
}[ScalarKind];

export type FilterLeaf =
  | ComparisonLeaf
  | {
      kind: "condition";
      subject: ConditionSubject;
      operator: UnaryFilterOperator;
      value?: undefined;
    }
  | {
      kind: "condition";
      subject: { kind: "entityType" };
      operator: "isOfType";
      value: Extract<FilterValue, { kind: "VersionedUrl" }>;
      /** Also match entities whose types inherit from this type, directly or indirectly. */
      includeSubtypes?: boolean;
      /** Match any version of the type. */
      anyVersion?: boolean;
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

export type ConditionError =
  | Extract<FilterResult, { status: "error" }>
  | {
      status: "error";
      code: "invalidCondition" | "entityRequired";
      message: string;
    };

const invalidCondition = (message: string): ConditionError => ({
  status: "error",
  code: "invalidCondition",
  message,
});

/** The payload kinds a scalar operator compares: those with a primitive type. */
export type ScalarKind = {
  [Kind in PayloadKind]: PrimitiveOf<Kind> extends null ? never : Kind;
}[PayloadKind];

const traitsOf = (kind: PayloadKind): PayloadKindTraits =>
  payloadKindTraits[kind];

export const isScalarKind = (kind: PayloadKind): kind is ScalarKind =>
  traitsOf(kind).primitive !== null;

export const scalarKinds: readonly PayloadKind[] =
  allPayloadKinds.filter(isScalarKind);

/** Kinds whose fields a condition can read, with a `field` subject. */
const fieldKinds = allPayloadKinds.filter((kind) => traitsOf(kind).fields);

/** Kinds whose entity's properties and types a condition can read, with an `entityProperty` or `entityType` subject. */
const entityKinds = allPayloadKinds.filter((kind) => traitsOf(kind).entity);

export type FilterableKind =
  | ScalarKind
  | KindWithTrait<"fields">
  | KindWithTrait<"entity">;

/** Whether If and Filter list accept a payload kind: whether a condition can read something from it. */
export const isFilterableKind = (kind: PayloadKind): kind is FilterableKind => {
  const { primitive, fields, entity } = traitsOf(kind);
  return primitive !== null || !!fields || !!entity;
};

export const filterableKinds = allPayloadKinds.filter(isFilterableKind);

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
    case "condition":
      return undefined;
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

/**
 * Checks that a subject is well formed and can be read from an item of `inputKind`, returning why not. Shared by
 * condition leaves and sort keys.
 */
export const validateSubject = (
  subject: ConditionSubject,
  inputKind: PayloadKind,
): string | undefined => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
  if (typeof subject !== "object" || subject === null) {
    return "A subject must be an object.";
  }
  switch (subject.kind) {
    case "input":
      if (subject.payloadKind !== inputKind) {
        return "The input subject kind must match the input payload kind.";
      }
      return undefined;
    case "field":
      if (
        !Array.isArray(subject.path) ||
        subject.path.some((segment) => typeof segment !== "string")
      ) {
        return "A field subject's path must be an array of strings.";
      }
      if (
        !fieldKinds.includes(inputKind) ||
        subject.path.length === 0 ||
        subject.path.some(
          (segment) =>
            !segment ||
            ["__proto__", "constructor", "prototype"].includes(segment),
        )
      ) {
        return "A field subject requires an object input and nonempty, safe own-property names.";
      }
      if (!allPayloadKinds.includes(subject.payloadKind)) {
        return "A field subject requires a known payload kind.";
      }
      return undefined;
    case "entityProperty":
    case "entityType":
      if (!entityKinds.includes(inputKind)) {
        return "Entity subjects require an EntityId or proposed entity input.";
      }
      if (subject.kind === "entityProperty") {
        if (
          typeof subject.propertyTypeBaseUrl !== "string" ||
          validateBaseUrl(subject.propertyTypeBaseUrl).type !== "Ok"
        ) {
          return "An entity property subject requires a property type base URL.";
        }
        if (!allPayloadKinds.includes(subject.payloadKind)) {
          return "An entity property subject requires a known payload kind.";
        }
      }
      return undefined;
    default:
      return "Unknown subject kind.";
  }
};

const validateLeaf = (
  leaf: FilterLeaf,
  inputKind: PayloadKind,
): ConditionError | undefined => {
  const { subject, operator, value } = leaf;
  const subjectError = validateSubject(subject, inputKind);
  if (subjectError) {
    return invalidCondition(subjectError);
  }
  /* Persisted definitions may set the flags on any leaf. */
  const flags = [
    (leaf as { includeSubtypes?: unknown }).includeSubtypes,
    (leaf as { anyVersion?: unknown }).anyVersion,
  ].filter((flag) => flag !== undefined);
  if (operator !== "isOfType" && flags.length > 0) {
    return invalidCondition(
      "includeSubtypes and anyVersion only apply to isOfType conditions.",
    );
  }
  if (flags.some((flag) => typeof flag !== "boolean")) {
    return invalidCondition("includeSubtypes and anyVersion must be booleans.");
  }
  if (operator === "isEmpty" || operator === "isNotEmpty") {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
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
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Persisted definitions may be malformed.
      value?.kind !== "VersionedUrl" ||
      typeof value.value !== "string" ||
      validateVersionedUrl(value.value).type !== "Ok"
    ) {
      return invalidCondition(
        "Entity type conditions require isOfType and a versioned type URL.",
      );
    }
    return undefined;
  }
  if (
    operator === "isOfType" ||
    !scalarKinds.includes(subject.payloadKind) ||
    !value ||
    value.kind !== subject.payloadKind
  ) {
    return invalidCondition(
      `A scalar operator requires a subject of kind ${scalarKinds.join(", ")} and a comparison value of the same kind.`,
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
  if (!isFilterableKind(inputKind)) {
    return invalidCondition(`${inputKind} payloads cannot be filtered.`);
  }
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

/**
 * Checks a step's `condition` input against the kind connected to its `kindSourceName` input, when the flow is
 * defined. The condition must be a constant for now. If the kind doesn't resolve, the step checks the condition
 * when it runs.
 */
export const checkConditionInput =
  (kindSourceName: string): ActionStepCheck =>
  ({ step, getInputKind, report }) => {
    const source = step.inputs.condition;

    /* A missing condition is reported as a missing input. */
    if (!source) {
      return;
    }

    if (source.kind !== "constant") {
      report("condition", "The condition must be a constant for now");
      return;
    }

    const kind = getInputKind(kindSourceName);

    /* A constant of another kind is reported as an incompatible connection. */
    if (source.payload.kind !== "FilterCondition" || !kind) {
      return;
    }

    const error = validateCondition(
      source.payload.value as FilterCondition,
      kind,
    );

    if (error) {
      report("condition", error.message);
    }
  };
