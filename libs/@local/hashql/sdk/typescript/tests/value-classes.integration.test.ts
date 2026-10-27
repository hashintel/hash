import { Effect, Equal, Hash, Option, Result, Schema } from "effect";
import { assert, describe, expect, expectTypeOf, test } from "vitest";

import { JExpr, Program } from "@local/hashql";

import type { Type } from "@local/hashql";

const { Module } = Program;

describe("emitted_value_classes", () => {
  test("emitted_value_class_contract", () => {
    expect.hasAssertions();
    const declaration = Module.value<Type.PrimitiveInteger>();
    expectTypeOf(declaration).toExtend<Program.Module.Declaration.Any>();
    const module = Result.getOrThrow(
      Module.define("::public", { values: { count: declaration } }),
    );
    expectTypeOf(module).toExtend<Program.Module.Module.Any>();
    const text: JExpr.Path.Path.Encoded = "local";
    const path = Result.getOrThrow(JExpr.Path.decodeResult(text));
    const moved = Result.getOrThrow(module.pipe(Module.relocate(path)));
    expectTypeOf(moved).toEqualTypeOf<typeof module>();
    expect(moved.path.pipe(JExpr.Path.compile)).toBe("local");
    expect(Equal.isEqual(moved)).toBe(true);
    expect(
      Equal.equals(declaration, Module.value<Type.PrimitiveString>()),
    ).toBe(true);
    expect(Hash.hash(declaration)).toBe(
      Hash.hash(Module.value<Type.PrimitiveString>()),
    );
  });
});

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

  test("emitted_constructor_ordinary_input", () => {
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
