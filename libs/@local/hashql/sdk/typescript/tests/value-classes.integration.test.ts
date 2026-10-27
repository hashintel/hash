import { Effect, Equal, Hash, Option, Result, Schema } from "effect";
import { assert, describe, expect, expectTypeOf, test } from "vitest";

import { JExpr } from "@local/hashql";

describe("emitted_path_classes", () => {
  test("emitted_nested_reference_decoding_and_construction", () => {
    expect.hasAssertions();
    const input = {
      rooted: false,
      segments: [
        {
          name: { _tag: "Lexical", value: "Box" },
          arguments: [
            {
              _tag: "GenericArgument",
              bound: {
                _tag: "Reference",
                path: {
                  rooted: false,
                  segments: [
                    { name: { _tag: "Lexical", value: "Item" }, arguments: [] },
                  ],
                },
              },
            },
          ],
        },
      ],
    } as const;
    const decoded = Result.getOrThrow(
      Schema.decodeResult(JExpr.Path.SchemaFromSelf)(input),
    );
    for (const path of [
      decoded,
      JExpr.Path.make(input),
      Option.getOrThrow(JExpr.Path.makeOption(input)),
      Effect.runSync(JExpr.Path.makeEffect(input)),
      JExpr.Path.Schema.make(input),
      JExpr.Path.SchemaFromSelf.make(input),
    ]) {
      expect(path.pipe(JExpr.Path.compile)).toBe("Box<Item>");
      expect(Equal.equals(decoded, path)).toBe(true);
      expect(Hash.hash(decoded)).toBe(Hash.hash(path));
      const bound = path.segments[0].arguments[0]?.bound;
      assert(bound?._tag === "Reference");
      expect(bound.path.pipe(JExpr.Path.compile)).toBe("Item");
      expect(Equal.isEqual(bound.path.segments[0])).toBe(true);
    }
    const encoded = Result.getOrThrow(
      Schema.encodeResult(JExpr.Path.SchemaFromSelf)(decoded),
    );
    expect(encoded).toStrictEqual(input);
    const bound = encoded.segments[0].arguments[0]?.bound;
    assert(bound?._tag === "Reference");
    expectTypeOf(bound.path.rooted).toEqualTypeOf<boolean>();
    expectTypeOf<
      (typeof bound.path.segments)[0]["arguments"][number]["bound"]["_tag"]
    >().toEqualTypeOf<JExpr.Type.Type["_tag"]>();
    expect(Equal.isEqual(bound.path)).toBe(false);
  });

  test("emitted_schema_constructors_accept_ordinary_input", () => {
    expect.hasAssertions();
    const input = {
      rooted: false,
      segments: [
        {
          name: { _tag: "Lexical", value: "Box" },
          arguments: [{ _tag: "GenericArgument", bound: { _tag: "Infer" } }],
        },
      ],
    } as const;
    const values = [
      JExpr.Path.make(input),
      Option.getOrThrow(JExpr.Path.makeOption(input)),
      Effect.runSync(JExpr.Path.makeEffect(input)),
      JExpr.Path.Schema.make(input),
      Result.getOrThrow(Schema.decodeResult(JExpr.Path.SchemaFromSelf)(input)),
    ];
    for (const path of values) {
      expect(path.pipe(JExpr.Path.compile)).toBe("Box<_>");
      expect(Equal.isEqual(path.segments[0])).toBe(true);
      expect(path.segments[0].arguments.every(Equal.isEqual)).toBe(true);
    }
    const type = JExpr.Type.make({ _tag: "Reference", path: input });
    expect(JExpr.Type.compile(type)).toBe("Box<_>");
  });
});
