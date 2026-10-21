import { Big } from "big.js";

Big.DP = 20;
Big.RM = Big.roundDown;

// oxlint-disable-next-line typescript/no-restricted-types -- caught values are of unknown type
const describeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
};

export const divide = (numerator: Big, denominator: Big): Big => {
  try {
    if (denominator.eq(0)) {
      return new Big(0);
    }

    return numerator.div(denominator);
  } catch (error) {
    throw new Error(`Division error: ${describeError(error)}`, {
      cause: error,
    });
  }
};

export const add = (augend: Big, addend: Big): Big => {
  try {
    return augend.plus(addend);
  } catch (error) {
    throw new Error(`Addition error: ${describeError(error)}`, {
      cause: error,
    });
  }
};

export const subtract = (minuend: Big, subtrahend: Big): Big => {
  try {
    return minuend.minus(subtrahend);
  } catch (error) {
    throw new Error(`Subtraction error: ${describeError(error)}`, {
      cause: error,
    });
  }
};

export const multiply = (multiplicand: Big, multiplier: Big): Big => {
  try {
    return multiplicand.times(multiplier);
  } catch (error) {
    throw new Error(`Multiplication error: ${describeError(error)}`, {
      cause: error,
    });
  }
};
