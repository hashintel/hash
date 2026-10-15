import { dayMs, isIsoDate, parseDateTime } from "./datetime.js";
import { payloadKindPrimitives } from "./types.js";

import type { ScalarKind } from "./filter-condition.js";
import type { PayloadKindValues, PayloadPrimitive } from "./types.js";

export type FilterValue = {
  [Kind in ScalarKind]: { kind: Kind; value: PayloadKindValues[Kind] };
}[ScalarKind];

const equalityOperators = ["equals", "notEquals"] as const;

const orderingOperators = [
  ...equalityOperators,
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;

/**
 * The operators that compare a value of each primitive type with an operand. `onSameDate` matches two instants on
 * the same UTC calendar date, whatever their offsets.
 */
const binaryFilterOperatorsByPrimitive = {
  text: [...equalityOperators, "contains", "startsWith", "endsWith"],
  number: orderingOperators,
  date: orderingOperators,
  datetime: [...orderingOperators, "onSameDate"],
  boolean: equalityOperators,
} as const satisfies Record<PayloadPrimitive, readonly string[]>;

export type BinaryFilterOperator<Kind extends ScalarKind = ScalarKind> =
  (typeof binaryFilterOperatorsByPrimitive)[Extract<
    (typeof payloadKindPrimitives)[Kind],
    PayloadPrimitive
  >][number];

/** Operators that take no operand. */
export const unaryFilterOperators = ["isEmpty", "isNotEmpty"] as const;

export type UnaryFilterOperator = (typeof unaryFilterOperators)[number];

export type ScalarFilterCondition = {
  operator: BinaryFilterOperator | UnaryFilterOperator;
  operand?: PayloadKindValues[ScalarKind];
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

/** Whether a value has the JavaScript type of a primitive, whether or not it's a valid value of it. */
export const hasPrimitiveType = (
  primitive: PayloadPrimitive,
  value: unknown,
): boolean => {
  switch (primitive) {
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "text":
    case "date":
    case "datetime":
      return typeof value === "string";
  }
};

/**
 * Reads a value of a primitive type into one that compares with `<` and `===`: an instant for a `datetime`, the value
 * itself otherwise. Returns `undefined` for a value that isn't valid: of another type, a date or date and time that
 * doesn't parse, or a number that isn't finite.
 */
export const readScalar = (
  primitive: PayloadPrimitive,
  value: unknown,
): string | number | boolean | undefined => {
  if (!hasPrimitiveType(primitive, value)) {
    return undefined;
  }
  switch (primitive) {
    case "date":
      return isIsoDate(value as string) ? (value as string) : undefined;
    case "datetime": {
      const instant = parseDateTime(value);
      return typeof instant === "number" ? instant : undefined;
    }
    case "number":
      return Number.isFinite(value) ? (value as number) : undefined;
    case "text":
    case "boolean":
      return value as string | boolean;
  }
};

const validValueDescriptions = {
  text: "a string",
  number: "a finite number",
  date: "an ISO calendar date (YYYY-MM-DD)",
  datetime:
    'an ISO 8601 date and time with Z or an offset, e.g. "2026-10-16T14:00:00Z"',
  boolean: "a boolean",
} as const satisfies Record<PayloadPrimitive, string>;

/**
 * Low-level scalar comparison. Action wrappers use evaluateCondition/evaluateIf
 * for missing-value semantics, subject resolution and groups. This helper treats
 * empty text literally (for example, equals("", "") matches).
 * A value is compared by its kind's primitive type: see binaryFilterOperatorsByPrimitive
 * for the operators each supports.
 * Text comparisons are case-sensitive. Only an empty string is empty: whitespace,
 * zero and false are values. Dates are ISO calendar dates (YYYY-MM-DD), not timestamps.
 * Date-times are compared as the instants they name, so 14:00Z equals 16:00+02:00.
 * An empty Date or DateTime is accepted only for emptiness checks. Numbers must be finite.
 * Operands must have the input's kind; unary operators ignore the operand.
 */
export const evaluateFilter = ({
  value,
  condition,
}: {
  value: FilterValue;
  condition: ScalarFilterCondition;
}): FilterResult => {
  const { operator, operand } = condition;
  const primitive = payloadKindPrimitives[value.kind];

  if (!hasPrimitiveType(primitive, value.value)) {
    return {
      status: "error",
      code: "invalidValue",
      message: "Value does not match its declared scalar kind.",
    };
  }

  const isUnary = operator === "isEmpty" || operator === "isNotEmpty";
  if (
    !isUnary &&
    !(
      binaryFilterOperatorsByPrimitive[primitive] as readonly string[]
    ).includes(operator)
  ) {
    return {
      status: "error",
      code: "unsupportedOperator",
      message: `Operator ${operator} does not support ${value.kind}.`,
    };
  }

  const left = readScalar(primitive, value.value);
  if (left === undefined && !(isUnary && value.value === "")) {
    return {
      status: "error",
      code: "invalidValue",
      message: `Value must be ${validValueDescriptions[primitive]}.`,
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

  const right = readScalar(primitive, operand);
  if (left === undefined || right === undefined) {
    return {
      status: "error",
      code: "invalidOperand",
      message: `Operand must be a valid ${value.kind} value.`,
    };
  }

  let matched: boolean;
  switch (operator) {
    case "equals":
      matched = left === right;
      break;
    case "notEquals":
      matched = left !== right;
      break;
    case "contains":
      matched = String(left).includes(String(right));
      break;
    case "startsWith":
      matched = String(left).startsWith(String(right));
      break;
    case "endsWith":
      matched = String(left).endsWith(String(right));
      break;
    case "onSameDate":
      matched =
        Math.floor(Number(left) / dayMs) === Math.floor(Number(right) / dayMs);
      break;
    case "greaterThan":
      matched = left > right;
      break;
    case "greaterThanOrEqual":
      matched = left >= right;
      break;
    case "lessThan":
      matched = left < right;
      break;
    case "lessThanOrEqual":
      matched = left <= right;
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
