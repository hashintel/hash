import { expect, it, test } from "@effect/vitest";
import { Option, Result, Schema } from "effect";
import { describe } from "vitest";

import { typeSyntax } from "../../internal/type-parser.js";
import * as Type from "./index.js";

describe("roundtrip", () => {
  it.prop(
    "type_grammar",
    [typeSyntax.arbitrary()],
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
