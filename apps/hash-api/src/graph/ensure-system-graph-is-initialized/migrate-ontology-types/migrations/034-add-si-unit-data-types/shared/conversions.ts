import type { Conversions, ConversionValue } from "@blockprotocol/type-system";

const constant = (value: number): ConversionValue => ({
  const: value,
  type: "number",
});

export const scaledConversion = (factor: number, divisor = 1): Conversions => ({
  to: {
    expression: ["/", ["*", "self", constant(factor)], constant(divisor)],
  },
  from: {
    expression: ["/", ["*", "self", constant(divisor)], constant(factor)],
  },
});

export const affineConversion = ({
  factor = 1,
  divisor = 1,
  inputOffset = 0,
  offset = 0,
}: {
  factor?: number;
  divisor?: number;
  inputOffset?: number;
  offset?: number;
}): Conversions => ({
  to: {
    expression: [
      "+",
      [
        "/",
        ["*", ["+", "self", constant(inputOffset)], constant(factor)],
        constant(divisor),
      ],
      constant(offset),
    ],
  },
  from: {
    expression: [
      "-",
      [
        "/",
        ["*", ["-", "self", constant(offset)], constant(divisor)],
        constant(factor),
      ],
      constant(inputOffset),
    ],
  },
});
