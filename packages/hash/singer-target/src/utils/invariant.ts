import { stringy } from "./stringy";

export function invariant(
  x: any,
  message: string,
  options: InvariantOptions = {},
): asserts x {
  if (!x) {
    throw new InvariantError(message, options);
  }
}
type InvariantOptions = {
  found?: any;
};
class InvariantError extends Error {
  constructor(message: string, options: InvariantOptions) {
    if ("found" in options) {
      super(`${message}; found: ${stringy(options.found)}`);
    } else {
      super(message);
    }
    this.name = "Invariant";
    this.stack = this.stack
      ?.split(/\n\r?/g)
      .filter((a) => !a.includes("nvariant"))
      .join("\n");
  }
}
