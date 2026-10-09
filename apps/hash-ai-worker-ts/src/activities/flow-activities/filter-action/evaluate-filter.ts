import type { PayloadKindValues } from "@local/hash-isomorphic-utils/flows/types";

type FilterPayloadKind = "Text" | "Number" | "Boolean" | "Date" | "EntityId";

export type FilterValue = {
  [Kind in FilterPayloadKind]: { kind: Kind; value: PayloadKindValues[Kind] };
}[FilterPayloadKind];

/** Operators that compare the value with an operand. */
export const binaryFilterOperators = [
  "equals",
  "notEquals",
  "contains",
  "startsWith",
  "endsWith",
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;

/** Operators that take no operand. */
export const unaryFilterOperators = ["isEmpty", "isNotEmpty"] as const;

export type ScalarFilterCondition = {
  operator:
    | (typeof binaryFilterOperators)[number]
    | (typeof unaryFilterOperators)[number];
  operand?: PayloadKindValues[FilterPayloadKind];
};

export type FilterResult =
  | { status: "success"; branch: "matched" }
  | { status: "success"; branch: "notMatched" }
  | {
      status: "error";
      code:
        | "unsupportedOperator"
        | "missingOperand"
        | "invalidOperand"
        | "invalidValue";
      message: string;
    };

const isIsoDate = (value: string): boolean => {
  const timestamp = Date.parse(value);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(timestamp) &&
    new Date(timestamp).toISOString().slice(0, 10) === value
  );
};

/**
 * Low-level scalar comparison. Action wrappers use evaluateCondition/evaluateIf
 * for missing-value semantics, subject resolution and groups. This helper treats
 * empty text literally (for example, equals("", "") matches).
 * Text comparisons are case-sensitive. Only an empty string is empty: whitespace,
 * zero and false are values. Entity IDs support equality, inequality and presence only.
 * Dates are ISO calendar dates (YYYY-MM-DD), not timestamps. An empty Date is
 * accepted only for emptiness checks. Numbers must be finite.
 * Operands must have the input's scalar type; unary operators ignore the operand.
 */
export const evaluateFilter = ({
  value,
  condition,
}: {
  value: FilterValue;
  condition: ScalarFilterCondition;
}): FilterResult => {
  const { operator, operand } = condition;

  if (
    (value.kind === "Number" && typeof value.value !== "number") ||
    (value.kind === "Boolean" && typeof value.value !== "boolean") ||
    (value.kind !== "Number" &&
      value.kind !== "Boolean" &&
      typeof value.value !== "string")
  ) {
    return {
      status: "error",
      code: "invalidValue",
      message: "Value does not match its declared scalar kind.",
    };
  }

  const isUnary = operator === "isEmpty" || operator === "isNotEmpty";
  if (
    (value.kind === "EntityId" &&
      operator !== "equals" &&
      operator !== "notEquals" &&
      !isUnary) ||
    ((operator === "contains" ||
      operator === "startsWith" ||
      operator === "endsWith") &&
      value.kind !== "Text") ||
    ((operator === "greaterThan" ||
      operator === "lessThan" ||
      operator === "greaterThanOrEqual" ||
      operator === "lessThanOrEqual") &&
      value.kind !== "Number" &&
      value.kind !== "Date")
  ) {
    return {
      status: "error",
      code: "unsupportedOperator",
      message: `Operator ${operator} does not support ${value.kind}.`,
    };
  }

  if (
    (value.kind === "Date" &&
      !(isUnary && value.value === "") &&
      !isIsoDate(value.value)) ||
    (value.kind === "Number" && !Number.isFinite(value.value))
  ) {
    return {
      status: "error",
      code: "invalidValue",
      message: `Value must be ${value.kind === "Date" ? "an ISO calendar date (YYYY-MM-DD)" : "a finite number"}.`,
    };
  }

  if (isUnary) {
    const empty = value.value === "";
    return {
      status: "success",
      branch: empty === (operator === "isEmpty") ? "matched" : "notMatched",
    };
  }

  if (operand === undefined) {
    return {
      status: "error",
      code: "missingOperand",
      message: `Operator ${operator} requires an operand.`,
    };
  }

  if (
    typeof operand !== typeof value.value ||
    (value.kind === "Date" &&
      typeof operand === "string" &&
      !isIsoDate(operand)) ||
    (value.kind === "Number" && !Number.isFinite(operand))
  ) {
    return {
      status: "error",
      code: "invalidOperand",
      message: `Operand must be a valid ${value.kind} value.`,
    };
  }

  let matched: boolean;
  switch (operator) {
    case "equals":
      matched = value.value === operand;
      break;
    case "notEquals":
      matched = value.value !== operand;
      break;
    case "contains":
      matched =
        value.kind === "Text" &&
        typeof operand === "string" &&
        value.value.includes(operand);
      break;
    case "startsWith":
      matched =
        value.kind === "Text" &&
        typeof operand === "string" &&
        value.value.startsWith(operand);
      break;
    case "endsWith":
      matched =
        value.kind === "Text" &&
        typeof operand === "string" &&
        value.value.endsWith(operand);
      break;
    case "greaterThan":
      matched = value.value > operand;
      break;
    case "greaterThanOrEqual":
      matched = value.value >= operand;
      break;
    case "lessThan":
      matched = value.value < operand;
      break;
    case "lessThanOrEqual":
      matched = value.value <= operand;
      break;
    default:
      return {
        status: "error",
        code: "unsupportedOperator",
        message: "Unknown scalar filter operator.",
      };
  }

  return { status: "success", branch: matched ? "matched" : "notMatched" };
};
