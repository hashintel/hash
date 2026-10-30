import { expect, it, test } from "@effect/vitest";
import {
  Arbitrary,
  Effect,
  Equal,
  Hash,
  HashSet,
  Option,
  Result,
  Schema,
} from "effect";
import { describe } from "vitest";

import {
  DuplicateStructField,
  NestingTooDeep,
} from "../internal/type-parser.js";
import * as Path from "./Path.js";
import * as Type from "./Type/index.js";

/** Unwraps literal path input used by focused regression cases. */
const parse = (source: string): Path.Path =>
  Path.parse(source).pipe(Result.getOrThrow);

/** Checks every path component, including paths nested in argument type syntax. */
const checkType = (syntax: Path.Path | Type.Type): void => {
  if ("segments" in syntax) {
    expect(Equal.isEqual(syntax)).toBe(true);
    expect(syntax.pipe(Path.compile)).toBe(Path.compile(syntax));
    for (const segment of syntax.segments) {
      expect(Equal.isEqual(segment)).toBe(true);
      expect(segment.pipe((value) => value)).toBe(segment);
      for (const argument of segment.arguments) {
        expect(Equal.isEqual(argument)).toBe(true);
        expect(argument.pipe((value) => value)).toBe(argument);
        checkType(argument.bound);
      }
    }
    return;
  }
  switch (syntax._tag) {
    case "Reference": {
      checkType(syntax.path);
      break;
    }
    case "Struct": {
      for (const [, member] of syntax.members) {
        checkType(member);
      }
      break;
    }
    case "Tuple":
    case "Union":
    case "Intersection": {
      for (const member of syntax.members) {
        checkType(member);
      }
      break;
    }
    case "Infer": {
      break;
    }
  }
};

/** Ordinary constructor input without runtime protocol methods. */
const input = {
  rooted: true,
  segments: [
    {
      name: { _tag: "Lexical", value: "Box" },
      arguments: [{ _tag: "GenericArgument", bound: { _tag: "Infer" } }],
    },
  ],
} as const;

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

  test("duplicate_struct_field", () => {
    expect.hasAssertions();
    const source = "Box<(`+`: A, +: B)>";
    const failure = Option.getOrThrow(Result.getFailure(Path.parse(source)));
    expect(failure.offset).toBe(source.indexOf(")") + 1);
    expect([...failure.expected]).toStrictEqual([
      DuplicateStructField({ name: { _tag: "Symbol", value: "+" } }),
    ]);
    expect(Result.isFailure(Path.decodeResult(source))).toBe(true);
  });

  test.each([
    ["\u00E9", "e\u0301"],
    ["e\u0301", "\u00E9"],
  ])("canonical_duplicate_struct_field_%#", (first, second) => {
    expect.hasAssertions();
    const failure = Option.getOrThrow(
      Result.getFailure(Path.parse(`Box<(${first}: A, ${second}: B)>`)),
    );
    expect([...failure.expected]).toStrictEqual([
      DuplicateStructField({ name: { _tag: "Lexical", value: second } }),
    ]);
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

describe("path_protocols", () => {
  /** Every schema and parse producer builds the same path, with value instances at every level. */
  test("schema_and_parse_producers", () => {
    expect.hasAssertions();
    const paths = [
      Result.getOrThrow(Path.parse("::Box<_>")),
      Result.getOrThrow(Path.decodeResult("::Box<_>")),
      Result.getOrThrow(Schema.decodeResult(Path.Schema)("::Box<_>")),
      Result.getOrThrow(Schema.decodeResult(Path.SchemaFromSelf)(input)),
      Path.make(input),
      Option.getOrThrow(Path.makeOption(input)),
      Effect.runSync(Path.makeEffect(input)),
      Path.Schema.make(input),
      Option.getOrThrow(Path.Schema.makeOption(input)),
      Effect.runSync(Path.Schema.makeEffect(input)),
      Path.SchemaFromSelf.make(input),
      Option.getOrThrow(Path.SchemaFromSelf.makeOption(input)),
      Effect.runSync(Path.SchemaFromSelf.makeEffect(input)),
    ];
    const [first] = paths;
    for (const path of paths) {
      checkType(path);
      expect(Equal.equals(first, path)).toBe(true);
      expect(Hash.hash(first)).toBe(Hash.hash(path));
    }
    const segment = Path.Segment.make(input.segments[0]);
    const decodedArgument = Result.getOrThrow(
      Schema.decodeResult(Path.SegmentArgument)(input.segments[0].arguments[0]),
    );
    expect(Equal.isEqual(segment)).toBe(true);
    expect(Equal.isEqual(decodedArgument)).toBe(true);
    expect(
      Equal.isEqual(Path.SegmentArgument.make(input.segments[0].arguments[0])),
    ).toBe(true);
  });

  /** Field records nested in every type form decode, construct, re-parse and encode back to the same path. */
  test("raw_nested_reference_paths", () => {
    expect.hasAssertions();
    const leaf = {
      rooted: false,
      segments: [{ name: { _tag: "Lexical", value: "Item" }, arguments: [] }],
    } as const;
    const reference = { _tag: "Reference", path: leaf } as const;
    const bounds = [
      reference,
      {
        _tag: "Reference",
        path: {
          rooted: false,
          segments: [
            {
              name: { _tag: "Lexical", value: "Nested" },
              arguments: [{ _tag: "GenericArgument", bound: reference }],
            },
          ],
        },
      },
      { _tag: "Tuple", members: [reference] },
      {
        _tag: "Struct",
        members: [[{ _tag: "Lexical", value: "field" }, reference]],
      },
      { _tag: "Union", members: [reference, { _tag: "Infer" }] },
      { _tag: "Intersection", members: [reference, { _tag: "Infer" }] },
    ] as const;
    for (const bound of bounds) {
      for (const argument of [
        { _tag: "GenericArgument", bound },
        {
          _tag: "GenericConstraint",
          name: { _tag: "Lexical", value: "T" },
          bound,
        },
      ] as const) {
        const ordinary = {
          rooted: false,
          segments: [
            { name: { _tag: "Lexical", value: "Box" }, arguments: [argument] },
          ],
        } as const;
        const decoded = Result.getOrThrow(
          Schema.decodeResult(Path.SchemaFromSelf)(ordinary),
        );
        const constructed = [
          Path.make(ordinary),
          Option.getOrThrow(Path.makeOption(ordinary)),
          Effect.runSync(Path.makeEffect(ordinary)),
          Path.Schema.make(ordinary),
          Option.getOrThrow(Path.Schema.makeOption(ordinary)),
          Effect.runSync(Path.Schema.makeEffect(ordinary)),
          Path.SchemaFromSelf.make(ordinary),
          Option.getOrThrow(Path.SchemaFromSelf.makeOption(ordinary)),
          Effect.runSync(Path.SchemaFromSelf.makeEffect(ordinary)),
          decoded,
        ];
        for (const path of constructed) {
          checkType(path);
          expect(Equal.equals(decoded, path)).toBe(true);
          expect(Hash.hash(decoded)).toBe(Hash.hash(path));
        }
        const reparsed = decoded.pipe(
          Path.compile,
          Path.parse,
          Result.getOrThrow,
        );
        expect(Equal.equals(decoded, reparsed)).toBe(true);
        expect(Hash.hash(decoded)).toBe(Hash.hash(reparsed));
        const encoded = Result.getOrThrow(
          Schema.encodeResult(Path.SchemaFromSelf)(decoded),
        );
        expect(encoded).toStrictEqual(ordinary);
        checkType(
          Result.getOrThrow(Schema.decodeResult(Path.SchemaFromSelf)(encoded)),
        );
        checkType(
          Result.getOrThrow(
            Schema.decodeResult(Path.Segment)(ordinary.segments[0]),
          ).pipe((segment) =>
            Path.make({ rooted: false, segments: [segment] }),
          ),
        );
        const decodedArgument = Result.getOrThrow(
          Schema.decodeResult(Path.SegmentArgument)(argument),
        );
        expect(Equal.isEqual(decodedArgument)).toBe(true);
        checkType(decodedArgument.bound);
      }
    }
  });

  /** Decoding validates a reference path given as field records nested in an argument. */
  test("nested_reference_field_records", () => {
    expect.hasAssertions();
    for (const path of [
      { rooted: false, segments: [] },
      {
        rooted: false,
        segments: [{ name: { _tag: "Lexical", value: "" }, arguments: [] }],
      },
      "Item",
    ]) {
      const decoded = Schema.decodeUnknownResult(Path.GenericArgument)({
        _tag: "GenericArgument",
        bound: { _tag: "Reference", path },
      });
      expect(Result.isFailure(decoded)).toBe(true);
    }
    const path = Result.getOrThrow(Path.parse("Item"));
    const decoded = Result.getOrThrow(
      Schema.decodeResult(Path.GenericArgument)({
        _tag: "GenericArgument",
        bound: { _tag: "Reference", path },
      }),
    );
    checkType(decoded.bound);
    expect(Type.compile(decoded.bound)).toBe("Item");
  });

  test("nested_type_schema_and_reference_builder", () => {
    expect.hasAssertions();
    checkType(
      Result.getOrThrow(
        Schema.decodeResult(Type.Schema)({
          _tag: "Reference",
          path: "Outer<(field: Inner<T>), U: A & B>",
        }),
      ),
    );
    checkType(
      Option.getOrThrow(
        Type.reference("Box", Option.getOrThrow(Type.reference("Inner"))),
      ),
    );
    checkType(Type.make({ _tag: "Reference", path: input }));
  });

  /** Changing any one field of a path makes it compare unequal. */
  test("equality_per_field", () => {
    expect.hasAssertions();
    const base = Result.getOrThrow(Path.parse("::Box<T, U: V>::Item"));
    for (const source of [
      "Box<T, U: V>::Item",
      "::Other<T, U: V>::Item",
      "::Item::Box<T, U: V>",
      "::Box<U: V, T>::Item",
      "::Box<T, U: W>::Item",
      "::Box<T, X: V>::Item",
      "::Box<T, V>::Item",
    ]) {
      expect(Equal.equals(base, Result.getOrThrow(Path.parse(source)))).toBe(
        false,
      );
    }
    const copy = Result.getOrThrow(Path.parse("::Box<T, U: V>::Item"));
    expect(Equal.equals(base, copy)).toBe(true);
    expect(Hash.hash(base)).toBe(Hash.hash(copy));
    expect(Equal.equals(base.segments[0], copy.segments[0])).toBe(true);
    expect(Hash.hash(base.segments[0])).toBe(Hash.hash(copy.segments[0]));
    for (const [index, argument] of base.segments[0].arguments.entries()) {
      expect(Equal.equals(argument, copy.segments[0].arguments[index])).toBe(
        true,
      );
      expect(Hash.hash(argument)).toBe(
        Hash.hash(copy.segments[0].arguments[index]),
      );
    }
  });

  /** Construction copies field records, so mutating the input afterwards changes neither the path nor its hash. */
  test("ordinary_input_copy", () => {
    expect.hasAssertions();
    const segment = {
      name: { _tag: "Lexical" as const, value: "Box" },
      arguments: [],
    };
    const path = Path.make({ rooted: false, segments: [segment] });
    const hash = Hash.hash(path);
    segment.name.value = "Changed";
    expect(Path.compile(path)).toBe("Box");
    expect(Hash.hash(path)).toBe(hash);
  });

  test("existing_instance_identity", () => {
    expect.hasAssertions();
    const path = parse("Box");
    expect(Path.make(path)).toBe(path);
  });

  test("constructor_validation_and_options", () => {
    expect.hasAssertions();
    const invalid = {
      rooted: false,
      segments: [{ name: { _tag: "Lexical", value: "" }, arguments: [] }],
    } as const;
    expect(Option.isNone(Path.makeOption(invalid))).toBe(true);
    expect(() => Path.make(invalid)).toThrow("Schema validation failed");
    expect(Effect.runSync(Effect.isFailure(Path.makeEffect(invalid)))).toBe(
      true,
    );
    expect(
      Path.make(invalid, { disableChecks: true }).segments[0].name.value,
    ).toBe("");
  });

  it.prop("parser_arbitrary", [Path.arbitrary()], ([state]) => {
    expect.hasAssertions();
    checkType(state.output);
  });

  it.prop(
    "schema_arbitrary",
    [Arbitrary.schema(Path.SchemaFromSelf)],
    ([path]) => {
      expect.hasAssertions();
      checkType(path);
    },
  );
});
