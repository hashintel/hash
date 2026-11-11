/**
 * The most tokens one evaluation of a differential equation may couple.
 *
 * An equation of arity `n` runs once per combination of `n` tokens, so its
 * work grows with the token count to the power `n`, and the language
 * service and the compiler generate a tuple type and a loop nest of that
 * size. The bound keeps both small for a net that arrives from a file or a
 * host.
 */
export const MAX_DIFFERENTIAL_EQUATION_ARITY = 8;

/** Whether `arity` is a whole number of tokens an equation can couple. */
export const isSupportedArity = (arity: number): boolean =>
  Number.isInteger(arity) &&
  arity >= 1 &&
  arity <= MAX_DIFFERENTIAL_EQUATION_ARITY;
