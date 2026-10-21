import { label, render } from "./view";

import type { Token } from "../core/types";

/** Parameters and a loop variable shadow the imports; a label is no name. */
// eslint-disable-next-line no-shadow -- shadowing is what this fixture exercises
export const shadowed = (label: string, token: Token): string => {
  // eslint-disable-next-line no-shadow -- shadowing is what this fixture exercises
  outer: for (const render of [label]) {
    if (render === "") {
      break outer;
    }
  }
  return `${label}${token.kind}`;
};

export const unshadowed = (): string =>
  label({ id: "a", kind: "place" }) + render({ id: "b", kind: "transition" });

export class Holder {
  constructor(public readonly token: Token) {}
}
