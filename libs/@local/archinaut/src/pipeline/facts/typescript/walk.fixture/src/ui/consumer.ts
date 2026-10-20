import { label, render } from "./view";

export const shown = {
  kind: "place",
  text: render({ id: "p1", kind: "place" }),
};

/** Reads a property of a core type without importing core. */
export const kindOf = (token: Parameters<typeof label>[0]): string =>
  token.kind;
