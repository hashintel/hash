import * as v from "valibot";
import { expect, test } from "vitest";

import { browserCallResultBodySchema } from "./browser-calls";

const correlation = {
  capability: "capability",
  binding: "binding",
  toolName: "readNet",
  canonicalInput: {},
};

test("browser results require a JSON output and preserve optional metadata", () => {
  const output = { nested: [null, true, 42, "value", { empty: [] }] };
  expect(
    v.parse(browserCallResultBodySchema, { ...correlation, output }),
  ).toEqual({
    ...correlation,
    output,
  });
  expect(
    v.parse(browserCallResultBodySchema, {
      ...correlation,
      output: null,
      metadata: null,
    }),
  ).toEqual({ ...correlation, output: null, metadata: null });
  expect(v.safeParse(browserCallResultBodySchema, correlation).success).toBe(
    false,
  );
});

test("browser results accept undefined properties, which serialization drops, without normalizing them", () => {
  const output = {
    applied: true,
    detail: undefined,
    nested: { gone: undefined },
  };
  const parsed = v.parse(browserCallResultBodySchema, {
    ...correlation,
    output,
  });
  expect(parsed.output).toBe(output);
});

test.each([
  undefined,
  NaN,
  Infinity,
  1n,
  () => {},
  new Date(),
  { value: new Map() },
  [undefined],
  { nested: [undefined] },
])(
  "browser results reject non-JSON output rather than normalizing it: %s",
  (output) => {
    expect(
      v.safeParse(browserCallResultBodySchema, { ...correlation, output })
        .success,
    ).toBe(false);
  },
);

test("browser results reject non-JSON metadata", () => {
  expect(
    v.safeParse(browserCallResultBodySchema, {
      ...correlation,
      output: null,
      // An undefined property is dropped by serialization and accepted; NaN
      // would arrive as null, so it is still rejected.
      metadata: { invalid: NaN },
    }).success,
  ).toBe(false);
});
