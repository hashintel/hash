import { describe, expect, it } from "vitest";

import { detectUserCodeForm } from "./user-code-form";

describe("detectUserCodeForm", () => {
  it.each([
    ["export default TransitionKernel(() => ({}));", "module"],
    ["export default Lambda((tokensByPlace, parameters) => true);", "module"],
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
