import { Function, Result } from "effect";
import { assert, describe, expectTypeOf, test } from "vitest";

import { relocate } from "../../internal/relocation.js";
import * as JExpr from "../../JExpr/index.js";
import * as Program from "../index.js";

import type * as Type from "../../Type.js";

const { Expression, Import, Module, Namespace, Prelude, Structural } = Program;
const identity = Symbol("Item");
type Item = Type.Opaque<typeof identity, Type.PrimitiveInteger>;
const input = Expression.input(
  "count",
  Result.getOrThrow(Structural.type(BigInt)),
);
const source = Result.getOrThrow(
  Module.define("::source", {
    modules: { Item: Prelude.builtin.modules.math },
    types: { Item: Module.type<Item>(), List: Prelude.builtin.types.List },
    values: {
      Item: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Item>
      >(),
      count: input,
      equal: Prelude.builtin.modules.cmp.values.eq,
    },
  }),
);

describe("import_types", () => {
  test("partial_record_object_names", () => {
    const prototypeNames = Result.getOrThrow(
      Module.define("::prototype_names", {
        values: {
          constructor: source.values.Item,
          toString: source.values.equal,
          other: source.values.count,
        },
        types: { constructor: source.types.Item, toString: source.types.List },
      }),
    );
    const partial = Result.getOrThrow(
      Import.bind(prototypeNames, { other: "local" }),
    );
    expectTypeOf<keyof typeof partial.scope.values>().toEqualTypeOf<"local">();
    expectTypeOf<keyof typeof partial.scope.types>().toEqualTypeOf<never>();
    expectTypeOf(partial.scope.values.local).toExtend<
      typeof source.values.count
    >();
    const annotated = {
      other: "local",
    } as const satisfies Program.Import.Selection<
      typeof prototypeNames,
      "other"
    >;
    expectTypeOf(
      Result.getOrThrow(Import.bind(prototypeNames, annotated)),
    ).toEqualTypeOf<typeof partial>();
    const empty = Result.getOrThrow(Import.bind(prototypeNames, {}));
    expectTypeOf<keyof typeof empty.scope.values>().toEqualTypeOf<never>();
    const selected = Result.getOrThrow(
      Import.bind(prototypeNames, { constructor: "Local" }),
    );
    const flat = Namespace.flatten(selected.scope);
    expectTypeOf<keyof typeof selected.scope.values>().toEqualTypeOf<"Local">();
    expectTypeOf(flat.Local(1n)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
    expectTypeOf(Result.getOrThrow(Structural.type(flat.Local))).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
    const stringified = Result.getOrThrow(
      Import.bind(prototypeNames, { toString: "Sequence" }),
    );
    expectTypeOf(stringified.scope.types.Sequence(String)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(stringified.scope.values.Sequence(1n, "text")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
    // @ts-expect-error A partial alias record cannot request an unknown export.
    Import.bind(prototypeNames, { other: "local", missing: "absent" });
    const unknownSelection = { other: "local", missing: "absent" } as const;
    // @ts-expect-error Nonliteral records cannot hide unknown export names either.
    Import.bind(prototypeNames, unknownSelection);
    const importUnknownUnion = (
      selection: { other: "local" } | { missing: "absent" },
    ): void => {
      // @ts-expect-error Every record in a union must request known export names.
      Import.bind(prototypeNames, selection);
    };
    importUnknownUnion({ other: "local" });
    const importValidUnion = (
      selection: { other: "local" } | { constructor: "Local" },
    ): void => {
      Import.bind(prototypeNames, selection);
    };
    importValidUnion({ constructor: "Local" });
    // @ts-expect-error The only string selection is the wildcard.
    Import.bind(prototypeNames, "other");
    // @ts-expect-error A numeric value is not a selection.
    Import.bind(prototypeNames, 1);
    // @ts-expect-error Numeric record keys are not known export names.
    Import.bind(prototypeNames, { 1: "local" });
    // @ts-expect-error A selected Object name still requires a string alias.
    Import.bind(prototypeNames, { constructor: Object });
    // @ts-expect-error A selected Object name cannot be a method.
    Import.bind(prototypeNames, { toString: () => "local" });
  });

  test("wildcard_and_list_types", () => {
    const wildcard = Result.getOrThrow(Import.bind(source, "*"));
    expectTypeOf(wildcard.scope.values).toExtend<typeof source.values>();
    expectTypeOf<keyof typeof wildcard.scope.values>().toEqualTypeOf<
      keyof typeof source.values
    >();
    expectTypeOf(wildcard.scope.types).toExtend<typeof source.types>();
    expectTypeOf(wildcard.scope.modules).toExtend<typeof source.modules>();
    const selected = Result.getOrThrow(Import.bind(source, ["Item", "List"]));
    expectTypeOf(selected.scope.values.Item).toExtend<
      typeof source.values.Item
    >();
    expectTypeOf(selected.scope.modules.Item).toExtend<
      typeof source.modules.Item
    >();
    expectTypeOf(selected.scope.types.List).toExtend<
      typeof source.types.List
    >();
    // @ts-expect-error A name list excludes unselected exports.
    expectTypeOf(selected.scope.values.count);
    // @ts-expect-error Unknown exports cannot be requested.
    Import.bind(source, ["missing"]);
    // @ts-expect-error Aliases cannot request an unknown export.
    Import.bind(source, { missing: "local" });
  });

  test("alias_types", () => {
    const imported = Result.getOrThrow(
      Import.bind(source, {
        Item: "Local",
        List: "Sequence",
        count: "_",
        equal: "eq",
      }),
    );
    const flat = Namespace.flatten(imported.scope);
    expectTypeOf(flat.Local(1n)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
    expectTypeOf(Result.getOrThrow(Structural.type(flat.Local))).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
    expectTypeOf(flat.Local.add(1n, 2n)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    expectTypeOf(flat.Sequence(String)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(flat.eq(1n, "text")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
    expectTypeOf<
      Program.Expression.Value.Type<typeof flat.count>
    >().toEqualTypeOf<Type.PrimitiveInteger>();
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof flat.count>
    >().toEqualTypeOf<{ readonly count: Type.PrimitiveInteger }>();
    // @ts-expect-error The nominal result is not its representation.
    const integer: Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = flat.Local(1n);
    expectTypeOf(integer).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    // @ts-expect-error The constructor still requires an Integer.
    flat.Local("wrong");
    // @ts-expect-error Importing does not erase the source input requirement.
    const closed: Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = flat.count;
    expectTypeOf(closed).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    const moved = Result.getOrThrow(
      relocate(flat.Sequence, Result.getOrThrow(JExpr.Path.parse("Again"))),
    );
    expectTypeOf(moved).toEqualTypeOf<typeof source.types.List>();
    expectTypeOf(moved(BigInt)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>>
    >();
    // @ts-expect-error The adapted generic constructor still takes one type.
    moved(String, BigInt);
    // @ts-expect-error The source name was replaced by its alias.
    expectTypeOf(flat.Item);
  });
});

const scalars = Result.getOrThrow(
  Module.define("::scalars", {
    values: { count: input, text: Module.value<Type.PrimitiveString>() },
  }),
);
const scalarBaseline = Result.getOrThrow(Import.bind(scalars, "*"));
type Count = typeof scalarBaseline.scope.values.count;
type Text = typeof scalarBaseline.scope.values.text;
const capabilities = Result.getOrThrow(
  Module.define("::capabilities", {
    modules: { math: Prelude.builtin.modules.math },
    types: { List: Prelude.builtin.types.List, Item: Module.type<Item>() },
    values: {
      equal: Prelude.builtin.modules.cmp.values.eq,
      create:
        Module.value<Type.Function<readonly [Type.PrimitiveInteger], Item>>(),
    },
  }),
);
const capabilityBaseline = Result.getOrThrow(Import.bind(capabilities, "*"));

describe("import_presence", () => {
  test("alias_alternatives", () => {
    const alias = Function.identity<"first" | "second">("first");
    const imported = Result.getOrThrow(Import.bind(scalars, { count: alias }));
    expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<
      "first" | "second"
    >();
    expectTypeOf(imported.scope.values.first).toEqualTypeOf<
      Count | undefined
    >();
    expectTypeOf(imported.scope.values.second).toEqualTypeOf<
      Count | undefined
    >();
    const flat = Namespace.flatten(imported.scope);
    expectTypeOf(flat.first).toEqualTypeOf<Count | undefined>();
    // @ts-expect-error An alternative alias is not guaranteed to exist.
    const required: Count = flat.first;
    expectTypeOf(required).toEqualTypeOf<Count>();
    assert.isDefined(flat.first);
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof flat.first>
    >().toEqualTypeOf<{ readonly count: Type.PrimitiveInteger }>();
  });

  test("sentinel_alternatives", () => {
    const alias = Function.identity<"_" | "local">("_");
    const imported = Result.getOrThrow(Import.bind(scalars, { count: alias }));
    expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<
      "count" | "local"
    >();
    expectTypeOf(imported.scope.values.count).toEqualTypeOf<
      Count | undefined
    >();
    expectTypeOf(imported.scope.values.local).toEqualTypeOf<
      Count | undefined
    >();
    const same = Function.identity<"_" | "count">("_");
    const kept = Result.getOrThrow(Import.bind(scalars, { count: same }));
    expectTypeOf(kept.scope.values.count).toEqualTypeOf<Count>();
  });

  test("widened_lists", () => {
    const list = Result.getOrThrow(
      Import.bind(
        scalars,
        Function.identity<readonly ("count" | "text")[]>(["count"]),
      ),
    );
    expectTypeOf(list.scope.values.count).toEqualTypeOf<Count | undefined>();
    expectTypeOf(list.scope.values.text).toEqualTypeOf<Text | undefined>();
    const slot = Result.getOrThrow(
      Import.bind(
        scalars,
        Function.identity<readonly ["count" | "text"]>(["count"]),
      ),
    );
    expectTypeOf(slot.scope.values.count).toEqualTypeOf<Count | undefined>();
    expectTypeOf(slot.scope.values.text).toEqualTypeOf<Text | undefined>();
    const mixed = Result.getOrThrow(
      Import.bind(
        scalars,
        Function.identity<readonly ["count", ...("count" | "text")[]]>([
          "count",
        ]),
      ),
    );
    expectTypeOf(mixed.scope.values.count).toEqualTypeOf<Count>();
    expectTypeOf(mixed.scope.values.text).toEqualTypeOf<Text | undefined>();
  });

  test("optional_alias", () => {
    const imported = Result.getOrThrow(
      Import.bind(scalars, Function.identity<{ readonly count?: "local" }>({})),
    );
    expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<"local">();
    expectTypeOf(imported.scope.values.local).toEqualTypeOf<
      Count | undefined
    >();
    expectTypeOf(Namespace.flatten(imported.scope).local).toEqualTypeOf<
      Count | undefined
    >();
  });

  test("selection_unions", () => {
    const distinct = Result.getOrThrow(
      Import.bind(
        scalars,
        Function.identity<{ count: "local" } | { text: "label" }>({
          count: "local",
        }),
      ),
    );
    expectTypeOf<keyof typeof distinct.scope.values>().toEqualTypeOf<
      "local" | "label"
    >();
    expectTypeOf(distinct.scope.values.local).toEqualTypeOf<
      Count | undefined
    >();
    expectTypeOf(distinct.scope.values.label).toEqualTypeOf<Text | undefined>();
    const common = Result.getOrThrow(
      Import.bind(
        scalars,
        Function.identity<{ count: "local" } | { text: "local" }>({
          text: "local",
        }),
      ),
    );
    expectTypeOf(common.scope.values.local).toExtend<Count | Text>();
    expectTypeOf<undefined>().not.toExtend<typeof common.scope.values.local>();
    expectTypeOf<
      Program.Expression.Value.Type<typeof common.scope.values.local>
    >().toEqualTypeOf<Type.PrimitiveInteger | Type.PrimitiveString>();
  });

  test("optional_capabilities", () => {
    const imported = Result.getOrThrow(
      Import.bind(
        capabilities,
        Function.identity<
          readonly ("math" | "List" | "equal" | "Item" | "create")[]
        >([]),
      ),
    );
    expectTypeOf(imported.scope.modules.math).toEqualTypeOf<
      typeof capabilityBaseline.scope.modules.math | undefined
    >();
    expectTypeOf(imported.scope.types.List).toEqualTypeOf<
      typeof capabilityBaseline.scope.types.List | undefined
    >();
    expectTypeOf(imported.scope.values.equal).toEqualTypeOf<
      typeof capabilityBaseline.scope.values.equal | undefined
    >();
    const flat = Namespace.flatten(imported.scope);
    assert.isDefined(flat.math);
    expectTypeOf(flat.math.add(1n, 2n)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    assert.isDefined(flat.List);
    expectTypeOf(flat.List(String)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    assert.isDefined(flat.equal);
    expectTypeOf(flat.equal(1n, "text")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
    assert.isDefined(flat.Item);
    expectTypeOf(Result.getOrThrow(Structural.type(flat.Item))).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
    assert.isDefined(flat.create);
    expectTypeOf(flat.create(1n)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
  });

  test("broad_alias", () => {
    const alias = Function.identity<string>("local");
    const imported = Result.getOrThrow(Import.bind(scalars, { count: alias }));
    expectTypeOf(imported.scope.values["local"]).toEqualTypeOf<
      Count | undefined
    >();
  });

  test("optional_source", () => {
    const optional = Result.getOrThrow(
      Module.define("::optional", {
        values: Function.identity<{
          readonly count?: typeof scalars.values.count;
        }>({}),
      }),
    );
    const imported = Result.getOrThrow(
      Import.bind(optional, { count: "local" }),
    );
    expectTypeOf(imported.scope.values.local).toEqualTypeOf<
      Count | undefined
    >();
    expectTypeOf(Namespace.flatten(imported.scope).local).toEqualTypeOf<
      Count | undefined
    >();
  });
});
