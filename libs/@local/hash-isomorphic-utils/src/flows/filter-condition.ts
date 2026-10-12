import { binaryFilterOperators, evaluateFilter } from "./evaluate-filter.js";
import { allPayloadKinds } from "./types.js";

import type {
  FilterResult,
  FilterValue,
  ScalarFilterCondition,
} from "./evaluate-filter.js";
import type { PayloadKind } from "./types.js";
import type { ActionStepCheck } from "./validate-flow-definition.js";
import type { BaseUrl, VersionedUrl } from "@blockprotocol/type-system";

export type ConditionSubject =
  | { kind: "input"; payloadKind: PayloadKind }
  | { kind: "field"; path: readonly string[]; payloadKind: PayloadKind }
  | {
      kind: "entityProperty";
      propertyTypeBaseUrl: BaseUrl;
      payloadKind: PayloadKind;
    }
  | { kind: "entityType" };

export type ConditionValue =
  | FilterValue
  | { kind: "VersionedUrl"; value: VersionedUrl };

export type FilterLeaf = {
  kind: "condition";
  subject: ConditionSubject;
  operator: ScalarFilterCondition["operator"] | "isOfType";
  value?: ConditionValue;
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

const scalarOperators: readonly string[] = binaryFilterOperators;

/** The payload kinds If and Filter list accept: a condition can compare them or their fields. */
export const filterableKinds = [
  "Boolean",
  "Date",
  "EntityId",
  "FormattedText",
  "GoogleSheet",
  "Number",
  "PersistedEntityMetadata",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
  "Text",
  "WebPage",
  "WebSearchResult",
] as const satisfies readonly PayloadKind[];

export type FilterableKind = (typeof filterableKinds)[number];

const entityKinds: readonly PayloadKind[] = [
  "EntityId",
  "ProposedEntity",
  "ProposedEntityWithResolvedLinks",
];

const objectKinds: readonly PayloadKind[] = [
  "FormattedText",
  "GoogleSheet",
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
      if (!allPayloadKinds.includes(subject.payloadKind)) {
        return invalidCondition(
          "A field subject requires a known payload kind.",
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
      if (subject.kind === "entityProperty") {
        if (
          typeof subject.propertyTypeBaseUrl !== "string" ||
          !subject.propertyTypeBaseUrl
        ) {
          return invalidCondition(
            "An entity property subject requires a property type base URL.",
          );
        }
        if (!allPayloadKinds.includes(subject.payloadKind)) {
          return invalidCondition(
            "An entity property subject requires a known payload kind.",
          );
        }
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
  if (!(filterableKinds as readonly PayloadKind[]).includes(inputKind)) {
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
