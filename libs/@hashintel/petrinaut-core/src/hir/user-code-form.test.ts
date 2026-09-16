import { describe, expect, it } from "vitest";

import {
  detectStateConstraintForm,
  detectUserCodeForm,
} from "./user-code-form";

describe("detectUserCodeForm", () => {
  it.each([
    ["export default TransitionKernel(() => ({}));", "module"],
    ["export default Lambda((input, parameters) => true);", "module"],
    ["export = 1;", "module"],
    ["export {};", "module"],
    ["export const x = 1;", "module"],
    ["const x = 1;\nexport default Lambda(() => x);", "module"],
    [
      'import type { Foo } from "./foo";\nexport default Dynamics(() => []);',
      "module",
    ],
    ["", "body"],
    ["   \n  ", "body"],
    ["return true;", "body"],
    ["const x = 1;\nreturn x;", "body"],
    ["// export default Lambda used to be required\nreturn 1;", "body"],
    ["const exported = 1;\nreturn exported;", "body"],
    // A lone, still-being-typed `export` keyword parses as no statement at
    // all, so it classifies as a body; the module path takes over once the
    // export statement is complete enough to parse.
    ["export", "body"],
  ] as const)("classifies %j as %s", (code, expected) => {
    expect(detectUserCodeForm(code)).toBe(expected);
  });
});

describe("detectStateConstraintForm", () => {
  it.each([
    ["state.places.Queue.count <= 10", "expression"],
    ["state.places.", "expression"],
    [
      "// return is supplied internally\nstate.places.Queue.count > 0",
      "expression",
    ],
    ['state.places["return"].count > 0', "expression"],
    ["state.places.Queue.count > 0; parameters.rate > 0;", "body"],
    ["state.places.Queue.count > 0\nparameters.rate > 0", "body"],
    [
      "state.places.Queue.tokens.map((token) => { return token; }).length > 0",
      "expression",
    ],
    ["return true;", "body"],
    ["const count = state.places.Queue.count;\nreturn count > 0;", "body"],
    ["if (state.places.Queue.count > 0) return true;\nreturn false;", "body"],
  ] as const)("classifies %j as %s", (code, expected) => {
    expect(detectStateConstraintForm(code)).toBe(expected);
  });
});
