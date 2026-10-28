import { expect, it, test } from "@effect/vitest";
import { Arbitrary, HashSet, Option, Result, Schema } from "effect";
import { describe } from "vitest";

import { NestingTooDeep } from "../internal/type-parser.js";
import * as Path from "./Path.js";
import * as Type from "./Type/index.js";

/** Unwraps literal path input used by focused regression cases. */
const parse = (source: string): Path.Path =>
  Path.parse(source).pipe(Result.getOrThrow);

describe("roundtrip", () => {
  it.prop("path_grammar", [Path.arbitrary()], ([path]) => {
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
    expect(parse("Box<A & B | C>").segments[0].arguments[0]).toMatchObject({
      bound: {
        _tag: "Intersection",
        members: [{ _tag: "Reference" }, { _tag: "Union" }],
      },
    });
    expect(Path.compile(parse("Box<A & B | C>"))).toBe("Box<A & B | C>");
    expect(Path.compile(parse("Box<A | B & C>"))).toBe("Box<A | B & C>");

    const left = Option.getOrThrow(Type.reference("A"));
    const middle = Option.getOrThrow(Type.reference("B"));
    const right = Option.getOrThrow(Type.reference("C"));
    expect(Type.compile(Type.or(Type.and(left, middle), right))).toBe(
      "(A & B) | C",
    );
  });

  test("deeply_nested_tuple", () => {
    expect.hasAssertions();
    // A grammar that parses a tuple's last member twice does 2^18 member parses here, which exceeds the test timeout.
    const source = `Box<${"(A, ".repeat(18)}A${")".repeat(18)}>`;
    expect(Path.compile(parse(source))).toBe(source);
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
  ])("accepted_%j", (source) => {
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
  ])("rejected_%j", (source) => {
    expect.hasAssertions();
    expect(Result.isFailure(Path.parse(source))).toBe(true);
  });

  test("nesting_too_deep", () => {
    expect.hasAssertions();
    const source = `Box<${"(".repeat(100_000)}A${",)".repeat(100_000)}>`;
    const failure = Option.getOrThrow(Result.getFailure(Path.parse(source)));
    expect(failure.offset).toBe(0);
    expect([...failure.expected]).toStrictEqual([NestingTooDeep()]);
    expect(Result.isFailure(Path.decodeResult(source))).toBe(true);
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
