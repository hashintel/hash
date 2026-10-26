import { dayMs, isIsoDate, parseDateTime } from "./datetime.js";
import { payloadKindTraits } from "./types.js";

import type { ScalarKind } from "./filter-condition.js";
import type {
  PayloadKindValues,
  PayloadPrimitive,
  PrimitiveOf,
} from "./types.js";

export type FilterValue = {
  [Kind in ScalarKind]: { kind: Kind; value: PayloadKindValues[Kind] };
}[ScalarKind];

/** A value of a scalar kind that hasn't been checked against the kind yet. */
export interface ScalarValue {
  kind: ScalarKind;
  // oxlint-disable-next-line typescript/no-restricted-types -- deliberately unchecked: persisted values are validated against the kind by evaluateFilter
  value: unknown;
}

const equalityOperators = ["equals", "notEquals"] as const;

const orderingOperators = [
  ...equalityOperators,
  "greaterThan",
  "greaterThanOrEqual",
  "lessThan",
  "lessThanOrEqual",
] as const;

/**
 * The operators that compare a value of each primitive type with an operand. `onSameUtcDate` matches two instants on
 * the same UTC calendar date, whatever their offsets.
 */
const binaryFilterOperatorsByPrimitive = {
  text: [...equalityOperators, "contains", "startsWith", "endsWith"],
  number: orderingOperators,
  date: orderingOperators,
  datetime: [...orderingOperators, "onSameUtcDate"],
  boolean: equalityOperators,
} as const satisfies Record<PayloadPrimitive, readonly string[]>;

export type BinaryFilterOperator<Kind extends ScalarKind = ScalarKind> =
  (typeof binaryFilterOperatorsByPrimitive)[Extract<
    PrimitiveOf<Kind>,
    PayloadPrimitive
  >][number];

/** Operators that take no operand. */
export const unaryFilterOperators = ["isEmpty", "isNotEmpty"] as const;

export type UnaryFilterOperator = (typeof unaryFilterOperators)[number];

export interface ScalarFilterCondition {
  operator: BinaryFilterOperator | UnaryFilterOperator;
  operand?: PayloadKindValues[ScalarKind];
}

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
  // oxlint-disable-next-line typescript/no-restricted-types -- the value is arbitrary input whose type this function checks
  value: unknown,
): boolean => {
  switch (primitive) {
    case "number": {
      return typeof value === "number";
    }
    case "boolean": {
      return typeof value === "boolean";
    }
    case "text":
    case "date":
    case "datetime": {
      return typeof value === "string";
    }
  }
};

/**
 * Reads a value into one that compares with `<` and `===`: epoch milliseconds for a `datetime`, otherwise itself.
 * `undefined` if the value isn't valid.
 */
export const readScalar = (
  primitive: PayloadPrimitive,
  // oxlint-disable-next-line typescript/no-restricted-types -- the value is arbitrary input that is validated here
  value: unknown,
): string | number | boolean | undefined => {
  if (!hasPrimitiveType(primitive, value)) {
    return undefined;
  }
  switch (primitive) {
    case "date": {
      return typeof value === "string" && isIsoDate(value) ? value : undefined;
    }
    case "datetime": {
      const instant = parseDateTime(value);
      return typeof instant === "number" ? instant : undefined;
    }
    case "number": {
      return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
    }
    case "text":
    case "boolean": {
      return typeof value === "string" || typeof value === "boolean"
        ? value
        : undefined;
    }
  }
};

/** What a valid value of each primitive type looks like. */
const validValueDescriptions = {
  text: "text",
  number: "a finite number",
  date: "an ISO calendar date (YYYY-MM-DD)",
  datetime:
    'an ISO 8601 date and time with Z or an offset, e.g. "2026-10-16T14:00:00Z"',
  boolean: "true or false",
} satisfies Record<PayloadPrimitive, string>;

/** Compares two valid scalars with an operator, or `undefined` if the operator isn't a comparison. */
const compareScalars = (
  operator: BinaryFilterOperator,
  left: string | number | boolean,
  right: string | number | boolean,
): boolean | undefined => {
  switch (operator) {
    case "equals": {
      return left === right;
    }
    case "notEquals": {
      return left !== right;
    }
    case "contains": {
      return String(left).includes(String(right));
    }
    case "startsWith": {
      return String(left).startsWith(String(right));
    }
    case "endsWith": {
      return String(left).endsWith(String(right));
    }
    case "onSameUtcDate": {
      return (
        Math.floor(Number(left) / dayMs) === Math.floor(Number(right) / dayMs)
      );
    }
    case "greaterThan": {
      return left > right;
    }
    case "greaterThanOrEqual": {
      return left >= right;
    }
    case "lessThan": {
      return left < right;
    }
    case "lessThanOrEqual": {
      return left <= right;
    }
    default: {
      return undefined;
    }
  }
};

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
  value: ScalarValue;
  condition: ScalarFilterCondition;
}): FilterResult => {
  const { operator, operand } = condition;
  const { primitive } = payloadKindTraits[value.kind];

  if (!hasPrimitiveType(primitive, value.value)) {
    return {
      status: "error",
      code: "invalidValue",
      message: "Value does not match its declared scalar kind.",
    };
  }

  const isUnary = operator === "isEmpty" || operator === "isNotEmpty";
  const supportedOperators: readonly string[] =
    binaryFilterOperatorsByPrimitive[primitive];
  if (!isUnary && !supportedOperators.includes(operator)) {
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

  const matched = compareScalars(operator, left, right);
  if (matched === undefined) {
    return {
      status: "error",
      code: "unsupportedOperator",
      message: "Unknown scalar filter operator.",
    };
  }

  return { status: "success", branch: matched ? "matched" : "notMatched" };
};
