import * as v from "valibot";
import { expect, test } from "vitest";

import {
  browserCallEndedWithoutResult,
  browserCallStaleRefusal,
  browserCallUnstartedRefusal,
  browserCallResultBodySchema,
} from "./browser-calls";

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

test("what the model is told of a call that ends without a result is pinned", () => {
  expect(browserCallUnstartedRefusal).toMatchInlineSnapshot(
    `"Browser call was not started; no document operation was invoked."`,
  );
  expect(browserCallStaleRefusal).toMatchInlineSnapshot(
    `"Not started: the document changed by other means after your last view of the net. Read the net again, then make the change."`,
  );
  expect(
    (["failed", "expired", "stopped"] as const).flatMap((cause) => [
      browserCallEndedWithoutResult(cause, true),
      browserCallEndedWithoutResult(cause, false),
    ]),
  ).toMatchInlineSnapshot(`
    [
      "The non-mutating browser call failed; the document is unchanged.",
      "The browser result failed; an attempted document effect is unknown.",
      "Browser call lease expired; the document is unchanged.",
      "Browser call lease expired; an attempted document effect is unknown.",
      "Browser call stopped; the document is unchanged.",
      "Browser call stopped; an attempted document effect is unknown.",
    ]
  `);
});
