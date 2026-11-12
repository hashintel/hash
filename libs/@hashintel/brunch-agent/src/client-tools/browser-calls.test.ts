import * as v from "valibot";
import { expect, test } from "vitest";

import { vBrowserCallResultBody } from "./browser-calls";

const correlation = {
  capability: "capability",
  binding: "binding",
  toolName: "readNet",
  canonicalInput: {},
};

test("browser results require a JSON output and preserve optional metadata", () => {
  const output = { nested: [null, true, 42, "value", { empty: [] }] };
  expect(v.parse(vBrowserCallResultBody, { ...correlation, output })).toEqual({
    ...correlation,
    output,
  });
  expect(
    v.parse(vBrowserCallResultBody, {
      ...correlation,
      output: null,
      metadata: null,
    }),
  ).toEqual({ ...correlation, output: null, metadata: null });
  expect(v.safeParse(vBrowserCallResultBody, correlation).success).toBe(false);
});

test.each([
  undefined,
  NaN,
  Infinity,
  1n,
  () => {},
  new Date(),
  { missing: undefined },
  [undefined],
])(
  "browser results reject non-JSON output rather than normalizing it: %s",
  (output) => {
    expect(
      v.safeParse(vBrowserCallResultBody, { ...correlation, output }).success,
    ).toBe(false);
  },
);

test("browser results reject non-JSON metadata", () => {
  expect(
    v.safeParse(vBrowserCallResultBody, {
      ...correlation,
      output: null,
      metadata: { invalid: undefined },
    }).success,
  ).toBe(false);
});
