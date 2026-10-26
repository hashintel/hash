import { expect, it, test } from "@effect/vitest";
import { Arbitrary, HashSet, Option, Result, Schema } from "effect";
import { describe } from "vitest";

import { typeSyntax } from "../internal/type-parser.js";
import * as Ident from "./Ident.js";
import * as Path from "./Path.js";
import * as Type from "./Type/index.js";

/** Unwraps literal path input used by focused regression cases. */
const parse = (source: string): Path.Path =>
  Path.parse(source).pipe(Result.getOrThrow);

describe("roundtrip", () => {
  it.prop("identifier grammar", [Ident.arbitrary()], ([ident]) => {
    expect.hasAssertions();

    const compiled = Ident.compile(ident.output);
    const decoded = Ident.decodeResult(compiled).pipe(Result.getOrThrow);

    expect(decoded).toStrictEqual(ident.output);
  });

  it.prop(
    "identifier schema",
    [Arbitrary.schema(Ident.SchemaFromSelf)],
    ([ident]) => {
      expect.hasAssertions();

      const compiled = Ident.compile(ident);
      const decoded = Ident.decodeResult(compiled).pipe(Result.getOrThrow);

      // Schema generation includes null-prototype records. The codec preserves their fields.
      expect(decoded).toStrictEqual({ ...ident });
    },
  );

  it.prop("path grammar", [Path.arbitrary()], ([path]) => {
    expect.hasAssertions();

    const compiled = Path.compile(path.output);
    const decoded = Path.decodeResult(compiled).pipe(Result.getOrThrow);

    expect(decoded).toStrictEqual(path.output);
  });

  it.prop(
    "path_schema_encoding",
    [Arbitrary.schema(Path.SchemaFromSelf)],
    ([path]) => {
      expect.hasAssertions();

      const compiled = Path.compile(path);
      const decoded = Path.decodeResult(compiled).pipe(Result.getOrThrow);

      // Single-member unions and intersections have no distinct syntax.
      expect(Path.compile(decoded)).toBe(compiled);
    },
  );

  it.prop(
    "type grammar",
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

describe("path_grammar", () => {
  test("segment_arguments", () => {
    expect.hasAssertions();
    const value = parse("::module<T>::Item<U: A | B, (Int, _), (key: String)>");
    expect(
      value.segments.map((segment) => segment.arguments.length),
    ).toStrictEqual([1, 3]);
    expect(value.segments[1]?.arguments[0]?._tag).toBe("GenericConstraint");
    expect(Path.compile(value)).toBe(
      "::module<T>::Item<U: A | B, (Int, _), (key: String)>",
    );
    expect(parse(Path.compile(value))).toStrictEqual(value);
  });

  test("union_precedence", () => {
    expect.hasAssertions();
    expect(Path.compile(parse("Box<A & B | C>"))).toBe("Box<A & B | C>");
    expect(Path.compile(parse("Box<A | B & C>"))).toBe("Box<A | B & C>");
  });

  test.each([
    "foo",
    "::foo::bar",
    "foo :: bar",
    "Box<(T)>",
    "Box<()>",
    "Box<(:)>",
    "Box<(T,)>",
    "Box<(field: T,)>",
    "Box<_>",
    "Box<_name: T>",
    "Box<`+`>",
    "Box<Container<T>>::Item<Map<K,V>>",
    "`https://example.com/a::b/`::Name",
  ])("accepted %j", (source) => {
    expect.hasAssertions();
    const value = parse(source);
    expect(parse(Path.compile(value))).toStrictEqual(value);
    expect(Result.getOrThrow(Path.decodeResult(source))).toStrictEqual(value);
  });

  test.each([
    "",
    "::",
    "foo::",
    "foo::::bar",
    "Box<>",
    "Box<T,>",
    "Box<T",
    "Box<T U>",
    "Box<T:>",
    "Box<(T>",
    "Box<(x: T, y)>",
    "foo.bar",
    "`name`",
  ])("rejected %j", (source) => {
    expect.hasAssertions();
    expect(Result.isFailure(Path.parse(source))).toBe(true);
  });

  test("nested_failure_offset", () => {
    expect.hasAssertions();
    const failure = Option.getOrThrow(
      Result.getFailure(Path.parse("Box<Inner<T>")),
    );
    expect(failure.offset).toBe(12);
    expect([...failure.expected]).toContainEqual({
      _tag: "ExpectedLiteral",
      literal: ">",
    });
    expect(HashSet.size(failure.expected)).toBeGreaterThan(0);
  });

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

  test("recursive_schema", () => {
    expect.hasAssertions();
    const value = parse("Box<(name: String, items: List<_>)>");
    expect(Path.make(value)).toStrictEqual(value);
    expect(
      Result.isFailure(
        Schema.decodeUnknownResult(Path.SchemaFromSelf)({
          rooted: false,
          segments: [],
        }),
      ),
    ).toBe(true);
  });
});

describe("identifier_grammar", () => {
  test.each(["cafe\u0301", "\u037E", "\u1FEF", "\u{1D15F}"])(
    "source_spelling %j",
    (source) => {
      expect.hasAssertions();
      const value = Result.getOrThrow(Ident.decodeResult(source));
      expect(value.value).toBe(source);
      expect(
        Result.getOrThrow(Ident.decodeResult(Ident.compile(value))),
      ).toStrictEqual(value);
      expect(Ident.make(value)).toStrictEqual(value);
    },
  );

  test("overlapping_character_classes", () => {
    expect.hasAssertions();
    expect(Result.getOrThrow(Ident.parse("℘"))).toStrictEqual({
      _tag: "Lexical",
      value: "℘",
    });
    expect(Result.getOrThrow(Ident.parse("`℘`"))).toStrictEqual({
      _tag: "Symbol",
      value: "℘",
    });
  });

  test.each([
    "`HTTP://EXAMPLE.COM/`",
    "`https://[::1]/`",
    "`https://example.com/a::b/`",
  ])("url %j", (source) => {
    expect.hasAssertions();
    expect(Ident.compile(Result.getOrThrow(Ident.decodeResult(source)))).toBe(
      source,
    );
  });

  test.each([
    "_",
    "`abc`",
    "`https://[bad]/`",
    "`https://x:99999/`",
    "`ftp://example.com/`",
    "\uD800",
  ])("invalid %j", (source) => {
    expect.hasAssertions();
    expect(Result.isFailure(Ident.parse(source))).toBe(true);
  });
});
