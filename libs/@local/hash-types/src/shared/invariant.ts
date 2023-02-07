export const mustBeDefined = <T>(x: T | undefined, message?: string): T => {
  if (x === undefined) {
    throw new Error(`invariant was broken: ${message ?? ""}`);
  }

  return x;
};
