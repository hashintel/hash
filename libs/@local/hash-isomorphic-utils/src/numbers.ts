import Big from "big.js";

Big.DP = 20;
Big.RM = Big.roundDown;

export const divide = (numerator: Big, denominator: Big): Big => {
  try {
    if (denominator.eq(0)) {
      return new Big(0);
    }

    return numerator.div(denominator);
  } catch (error: unknown) {
    throw new Error(
      `Division error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const add = (a: Big, b: Big): Big => {
  try {
    return a.plus(b);
  } catch (error: unknown) {
    throw new Error(
      `Addition error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const subtract = (a: Big, b: Big): Big => {
  try {
    return a.minus(b);
  } catch (error: unknown) {
    throw new Error(
      `Subtraction error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const multiply = (a: Big, b: Big): Big => {
  try {
    return a.times(b);
  } catch (error: unknown) {
    throw new Error(
      `Multiplication error: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};
