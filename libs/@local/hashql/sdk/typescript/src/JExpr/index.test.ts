import { expect, test } from "@effect/vitest";
import { Option } from "effect";
import { describe } from "vitest";

import * as JExpr from "./index.js";

describe("compile", () => {
  test.each([
    ["integer_beyond_double", JExpr.integer(2n ** 64n), "18446744073709551616"],
    ["float_integral", JExpr.float(1), "1.0"],
    ["float_negative_zero", JExpr.float(-0), "-0.0"],
    ["float_exponent", JExpr.float(1e21), "1e+21"],
    ["literal_integral", JExpr.literal(1), "1"],
    ["literal_fraction", JExpr.literal(2.5), "2.5"],
  ] as const)("%s", (_, value, text) => {
    expect.hasAssertions();
    expect(JExpr.compile(value)).toBe(`{"#literal":${text}}`);
    expect(JExpr.make(value)).toStrictEqual(value);
  });

  test("dict_record", () => {
    expect.hasAssertions();
    const names = JExpr.dict({ "user.name": JExpr.literal("Alice") });
    expect(JExpr.compile(JExpr.make(names))).toBe(
      '{"#dict":{"user.name":{"#literal":"Alice"}}}',
    );
  });

  test("deep_nesting", () => {
    expect.hasAssertions();
    let value: JExpr.Expression = "x";
    for (let depth = 0; depth < 100_000; depth += 1) {
      value = JExpr.tuple(value);
    }

    expect(JExpr.compile(value)).toBe(
      `${'{"#tuple":['.repeat(100_000)}"x"${"]}".repeat(100_000)}`,
    );
  });

  test("special_form_heads", () => {
    expect.hasAssertions();
    const integer = Option.getOrThrow(JExpr.Type.reference("Integer"));
    expect(JExpr.as("value", integer)[0]).toBe("::kernel::special_form::as");
    expect(JExpr.fn({ params: {}, body: "value" })[0]).toBe(
      "::kernel::special_form::fn",
    );
  });
});

describe("make", () => {
  test("dict_pairs", () => {
    expect.hasAssertions();
    const pairs = JExpr.dict([["user.name", JExpr.literal("Alice")]]);
    expect(JExpr.compile(JExpr.make(pairs))).toBe(
      '{"#dict":[["user.name",{"#literal":"Alice"}]]}',
    );
  });

  test("struct_field_names", () => {
    expect.hasAssertions();
    const person = JExpr.struct({ name: JExpr.literal("Alice") });
    expect(JExpr.compile(JExpr.make(person))).toBe(
      '{"#struct":{"name":{"#literal":"Alice"}}}',
    );

    const invalid = JExpr.struct({ "not an ident": JExpr.literal("x") });
    expect(Option.isNone(JExpr.makeOption(invalid))).toBe(true);
    expect(() => JExpr.make(invalid)).toThrow(/^Schema validation failed$/u);
  });

  test("labeled_argument", () => {
    expect.hasAssertions();
    const greeting = JExpr.call(
      "greet",
      "user",
      JExpr.label("style", JExpr.literal("formal")),
    );
    expect(JExpr.compile(JExpr.make(greeting))).toBe(
      '["greet","user",{":style":{"#literal":"formal"}}]',
    );

    const invalid = JExpr.call("greet", JExpr.label("not an ident", "x"));
    expect(Option.isNone(JExpr.makeOption(invalid))).toBe(true);
  });

  test("numeric_spelling", () => {
    expect.hasAssertions();
    expect(Option.isNone(JExpr.makeOption(JExpr.integer(1.5)))).toBe(true);
    expect(Option.isNone(JExpr.makeOption(JExpr.float(Number.NaN)))).toBe(true);
  });
});
