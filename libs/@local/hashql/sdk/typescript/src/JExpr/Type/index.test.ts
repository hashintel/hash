import { expect, it, test } from "@effect/vitest";
import { Option, Result, Schema } from "effect";
import { describe } from "vitest";

import * as JExpr from "../index.js";
import * as Type from "./index.js";
import { pathGrammar } from "./schema.js";

describe("roundtrip", () => {
  it.prop(
    "type_grammar",
    [pathGrammar.typeSyntax.arbitrary()],
    ([type]) => {
      expect.hasAssertions();

      const encoded = Result.getOrThrow(
        Schema.encodeResult(Type.Schema)(type.output),
      );
      const decoded = Result.getOrThrow(
        Schema.decodeResult(Type.Schema)(encoded),
      );

      expect(decoded).toStrictEqual(type.output);
    },
    { arbitrary: { size: 100 } },
  );
});

describe("compile", () => {
  test("deep_nesting", () => {
    expect.hasAssertions();
    let type: Type.Type = Type.infer();
    for (let depth = 0; depth < 50_000; depth += 1) {
      type = Option.getOrThrow(Type.reference("List", Type.tuple(type)));
    }

    expect(Type.compile(type)).toBe(
      `${"List<(".repeat(50_000)}_${",)>".repeat(50_000)}`,
    );
  });
});

describe("make", () => {
  test("deep_nesting", () => {
    expect.hasAssertions();
    let type: Type.Type = Type.infer();
    for (let depth = 0; depth < 100_000; depth += 1) {
      type = Type.tuple(type);
    }

    expect(Option.isNone(Type.makeOption(type))).toBe(true);
    expect(
      Option.isNone(
        Type.reference(`Box<${"(".repeat(100_000)}_${",)".repeat(100_000)}>`),
      ),
    ).toBe(true);
  });
});

describe("builder", () => {
  test("reference_argument_append", () => {
    expect.hasAssertions();
    const value = Option.getOrThrow(
      Type.reference("Module<T>::Item<U>", Type.infer()),
    );
    expect(Type.compile(value)).toBe("Module<T>::Item<U, _>");
  });

  test("constructed_type_arguments", () => {
    expect.hasAssertions();
    const integer = Option.getOrThrow(
      Type.reference("::kernel::type::Integer"),
    );
    const string = Option.getOrThrow(Type.reference("::kernel::type::String"));
    const internal = Option.getOrThrow(Type.reference("_internal"));
    for (const bound of [
      Type.tuple(integer, string),
      Type.or(Type.and(integer, string), internal),
      internal,
    ]) {
      const value = Type.make(Option.getOrThrow(Type.reference("List", bound)));
      const encoded = Result.getOrThrow(
        Schema.encodeResult(Type.Schema)(value),
      );
      expect(
        Result.getOrThrow(Schema.decodeResult(Type.Schema)(encoded)),
      ).toStrictEqual(value);
    }
  });

  test("struct_name_spellings", () => {
    expect.hasAssertions();
    const integer = Option.getOrThrow(Type.reference("Integer"));
    expect(Option.isNone(Type.struct({ "+": integer, "`+`": integer }))).toBe(
      true,
    );
    expect(
      Result.isFailure(
        Schema.decodeResult(Type.Schema)({
          _tag: "Struct",
          members: [
            ["+", { _tag: "Infer" }],
            ["`+`", { _tag: "Infer" }],
          ],
        }),
      ),
    ).toBe(true);
  });

  test("singleton_argument", () => {
    expect.hasAssertions();
    const integer = Option.getOrThrow(Type.reference("Integer"));
    const value = Option.getOrThrow(
      Type.reference("List", Type.union(integer)),
    );
    const encoded = Result.getOrThrow(Schema.encodeResult(Type.Schema)(value));
    expect(
      Result.getOrThrow(Schema.decodeResult(Type.Schema)(encoded)),
    ).toStrictEqual(Option.getOrThrow(Type.reference("List", integer)));
  });
});

describe("type_expressions", () => {
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
      "::kernel::special_form::fn",
      { "#tuple": [] },
      { "#struct": { argument: expression } },
      expression,
      "argument",
    ]);
  });

  test("deep_nesting", () => {
    expect.hasAssertions();
    let type: Type.Type = Type.infer();
    for (let depth = 0; depth < 100_000; depth += 1) {
      type = Type.tuple(type);
    }

    expect(JExpr.compile(Type.toExpression(type))).toBe(
      `${'{"#tuple":['.repeat(100_000)}"_"${"]}".repeat(100_000)}`,
    );
  });

  test("annotation_string", () => {
    expect.hasAssertions();
    expect(JExpr.typed(JExpr.tuple(JExpr.integer(1)), tuple)["#type"]).toBe(
      "(::kernel::type::Integer,)",
    );
  });
});
