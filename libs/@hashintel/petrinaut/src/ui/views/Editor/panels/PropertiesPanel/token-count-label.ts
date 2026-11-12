/** How many tokens an equation of this arity couples: "1 token", "2 tokens". */
export const tokenCountLabel = (arity: number): string =>
  `${arity} token${arity === 1 ? "" : "s"}`;
