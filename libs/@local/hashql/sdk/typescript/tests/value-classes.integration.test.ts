import { Effect, Equal, Hash, Option, Record, Result, Schema } from "effect";
import { assert, describe, expect, expectTypeOf, test } from "vitest";

import { JExpr, Program } from "@local/hashql";

import type { Type } from "@local/hashql";

const { Module } = Program;

/** Emits a node's syntax through the public expression API. */
const syntax = (
  node: Parameters<typeof Program.Expression.fromNode>[0],
): string =>
  JExpr.compile(
    Result.getOrThrow(
      Program.Expression.toJExpr(Program.Expression.fromNode(node)),
    ),
  );

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

describe("emitted_import_prototype_names", () => {
  test("partial_prototype_name_selection", () => {
    expect.hasAssertions();
    const { Import, Expression } = Program;
    const source = Result.getOrThrow(
      Module.define("::source", {
        values: {
          constructor: Module.value<Type.PrimitiveInteger>(),
          toString: Module.value<Type.PrimitiveString>(),
          other: Module.value<Type.PrimitiveBoolean>(),
        },
      }),
    );
    const imported = Result.getOrThrow(Import.bind(source, { other: "local" }));
    expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<"local">();
    expectTypeOf(imported.scope.values.local).toExtend<
      typeof source.values.other
    >();
    expect(Record.keys(imported.scope.values)).toStrictEqual(["local"]);
    const empty = Result.getOrThrow(Import.bind(source, {}));
    expectTypeOf<keyof typeof empty.scope.values>().toEqualTypeOf<never>();
    expect(Record.keys(empty.scope.values)).toStrictEqual([]);
    const constructor = Result.getOrThrow(
      Import.bind(source, { constructor: "_" }),
    );
    expectTypeOf<
      keyof typeof constructor.scope.values
    >().toEqualTypeOf<"constructor">();
    expectTypeOf(constructor.scope.values.constructor).toExtend<
      typeof source.values.constructor
    >();
    expect(Record.keys(constructor.scope.values)).toStrictEqual([
      "constructor",
    ]);
    const stringified = Result.getOrThrow(
      Import.bind(source, { toString: "text" }),
    );
    expectTypeOf<
      keyof typeof stringified.scope.values
    >().toEqualTypeOf<"text">();
    expectTypeOf(stringified.scope.values.text).toExtend<
      typeof source.values.toString
    >();
    expect(Record.keys(stringified.scope.values)).toStrictEqual(["text"]);
    const node = Result.getOrThrow(
      Expression.toNode(imported.scope.values.local),
    );
    expect(syntax(imported.wrap(node))).toBe(
      '["::kernel::special_form::use","::source",{"#struct":{"other":"local"}},"local"]',
    );
    // @ts-expect-error Unknown exports cannot be requested, even beside known names.
    Import.bind(source, { other: "local", absent: "missing" });
    const importUnknownUnion = (
      selection: { other: "local" } | { absent: "missing" },
    ): void => {
      // @ts-expect-error Each possible record must request only known names.
      Import.bind(source, selection);
    };
    importUnknownUnion({ other: "local" });
  });
});

describe("emitted_import_with_value_classes", () => {
  test("emitted_import_class_and_enumerable_selection", () => {
    expect.hasAssertions();
    const { Import, Expression, Prelude } = Program;
    const selection = Object.defineProperty({ add: "hidden" }, "add", {
      enumerable: false,
    });
    const imported = Result.getOrThrow(
      Import.bind(Prelude.builtin.modules.math, selection),
    );
    const { wrap } = imported;
    const wrapped = Result.getOrThrow(
      Result.map(Expression.toNode(Expression.integer(1)), wrap),
    );
    expect(syntax(wrapped)).toBe(
      '["::kernel::special_form::use","::core::math",{"#struct":{}},{"#literal":1}]',
    );
    expect(Object.hasOwn(imported.scope.values, "hidden")).toBe(false);
    expect(Object.getPrototypeOf(imported)).not.toBe(Object.prototype);
    expect(Object.isFrozen(imported)).toBe(true);
  });

  test("imports_relocated_module_and_adapted_constructor", () => {
    expect.hasAssertions();
    const { Import, Namespace, Prelude, Expression, TypeExpression } = Program;
    const addend = 1n;
    const increment = 2n;
    const source = Result.getOrThrow(
      Module.define("::consumer", {
        modules: { math: Prelude.builtin.modules.math },
        types: { List: Prelude.builtin.types.List },
        values: { equal: Prelude.builtin.values.eq },
      }),
    );
    const imported = Result.getOrThrow(
      Import.bind(source, {
        math: "arithmetic",
        List: "Sequence",
        equal: "same",
      }),
    );
    const flat = Namespace.flatten(imported.scope);
    expectTypeOf(flat.Sequence(String)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(flat.same(addend, "one")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
    expectTypeOf(flat.arithmetic.add(addend, increment)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    expect(
      JExpr.Type.compile(Result.getOrThrow(flat.Sequence(String).syntax)),
    ).toBe("Sequence<::kernel::type::String>");
    const moved = Result.getOrThrow(
      Module.relocate(
        imported.scope.modules.arithmetic,
        Result.getOrThrow(JExpr.Path.parse("again")),
      ),
    );
    expectTypeOf(moved.values.add(addend, increment)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    expect(Equal.isEqual(moved.path)).toBe(true);
    const constructed = Result.getOrThrow(
      TypeExpression.relocate(
        imported.scope.types.Sequence,
        Result.getOrThrow(JExpr.Path.parse("Again")),
      ),
    );
    expect(
      JExpr.Type.compile(Result.getOrThrow(constructed(String).syntax)),
    ).toBe("Again<::kernel::type::String>");
    const node = Result.getOrThrow(
      Expression.toNode(flat.arithmetic.add(addend, increment)),
    );
    expect(syntax(imported.wrap(node))).toBe(
      '["::kernel::special_form::use","::consumer",{"#struct":{"math":"arithmetic","List":"Sequence","equal":"same"}},["arithmetic::add",{"#literal":1},{"#literal":2}]]',
    );
    const wildcard = Result.getOrThrow(Import.bind(source, "*"));
    const listed = Result.getOrThrow(Import.bind(source, ["equal"]));
    expect([
      syntax(wildcard.wrap(node)),
      syntax(listed.wrap(node)),
    ]).toStrictEqual([
      '["::kernel::special_form::use","::consumer","*",["arithmetic::add",{"#literal":1},{"#literal":2}]]',
      '["::kernel::special_form::use","::consumer",{"#tuple":["equal"]},["arithmetic::add",{"#literal":1},{"#literal":2}]]',
    ]);
    // @ts-expect-error Import selection retains the source module's known names.
    Import.bind(source, ["missing"]);
    // @ts-expect-error The adapted constructor retains its arity.
    flat.Sequence(String, BigInt);
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
