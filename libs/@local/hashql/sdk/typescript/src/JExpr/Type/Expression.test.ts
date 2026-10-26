import { Option } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../index.js";
import * as Type from "./index.js";

const integer = Option.getOrThrow(Type.reference("::kernel::type::Integer"));
const text = Option.getOrThrow(Type.reference("::kernel::type::String"));
const tuple = Type.tuple(integer);
const record = Option.getOrThrow(Type.struct({ value: tuple }));
const cases: readonly (readonly [string, Type.Type, JExpr.Expression])[] = [
  ["reference", integer, "::kernel::type::Integer"],
  ["tuple", tuple, { "#tuple": ["::kernel::type::Integer"] }],
  ["empty_tuple", Type.tuple(), { "#tuple": [] }],
  [
    "struct",
    record,
    { "#struct": { value: { "#tuple": ["::kernel::type::Integer"] } } },
  ],
  ["empty_struct", Option.getOrThrow(Type.struct({})), { "#struct": {} }],
  [
    "union",
    Type.union(integer, text),
    [
      "::kernel::type::Union",
      "::kernel::type::Integer",
      "::kernel::type::String",
    ],
  ],
  [
    "intersection",
    Type.intersection(integer, text),
    [
      "::kernel::type::Intersection",
      "::kernel::type::Integer",
      "::kernel::type::String",
    ],
  ],
  [
    "generic_argument",
    Option.getOrThrow(Type.reference("List", tuple)),
    "List<(::kernel::type::Integer,)>",
  ],
];

describe("type_expressions", () => {
  test.each(cases)("%s", (_, type, expression) => {
    expect.hasAssertions();
    expect(Type.toExpression(type)).toStrictEqual(expression);
    expect([
      JExpr.type("Local", type, "_")[2],
      JExpr.newtype("Local", type, "_")[2],
      JExpr.input("value", type)[2],
      JExpr.input("value", type, "default")[2],
      JExpr.as("value", type)[2],
    ]).toStrictEqual([
      expression,
      expression,
      expression,
      expression,
      expression,
    ]);
    expect(
      JExpr.fn({ params: { argument: type }, returns: type, body: "argument" }),
    ).toStrictEqual([
      "fn",
      { "#tuple": [] },
      { "#struct": { argument: expression } },
      expression,
      "argument",
    ]);
  });

  test("annotation_string", () => {
    expect.hasAssertions();
    expect(JExpr.typed(JExpr.tuple(JExpr.integer(1)), tuple)["#type"]).toBe(
      "(::kernel::type::Integer,)",
    );
  });
});
