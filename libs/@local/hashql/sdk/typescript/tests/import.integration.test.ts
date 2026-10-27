import { Record, Result } from "effect";
import { describe, expect, expectTypeOf, test } from "vitest";

import { Program } from "@local/hashql";

import type { Type } from "@local/hashql";

const { Expression, Import, Module, Namespace, Prelude, Structural } = Program;
const source = Result.getOrThrow(
  Module.define("::source", {
    values: {
      count: Expression.input("count", Structural.type(BigInt)),
      text: Module.value<Type.PrimitiveString>(),
    },
  }),
);
const baseline = Result.getOrThrow(Import.bind(source, "*"));
type Count = typeof baseline.scope.values.count;
type Text = typeof baseline.scope.values.text;
type Export =
  | Program.Expression.Expression.Any
  | Program.Module.Module.Any
  | Program.TypeExpression.Export;
const names = (
  table: Readonly<Record<string, Export | undefined>>,
): readonly string[] => Record.keys(table);

const checkAlias = (alias: "first" | "second"): void => {
  const imported = Result.getOrThrow(Import.bind(source, { count: alias }));
  expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<
    "first" | "second"
  >();
  expectTypeOf(imported.scope.values.first).toEqualTypeOf<Count | undefined>();
  expectTypeOf(imported.scope.values.second).toEqualTypeOf<Count | undefined>();
  const flat = Namespace.flatten(imported.scope);
  expectTypeOf(flat.first).toEqualTypeOf<Count | undefined>();
  if (flat.first !== undefined) {
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof flat.first>
    >().toEqualTypeOf<{ readonly count: Type.PrimitiveInteger }>();
  }
  // @ts-expect-error An alternative alias is not guaranteed to exist.
  const required: Count = flat.first;
  expectTypeOf(required).toEqualTypeOf<Count>();
  expect(names(imported.scope.values)).toStrictEqual([alias]);
};

const checkSentinel = (alias: "_" | "local", expected: string): void => {
  const imported = Result.getOrThrow(Import.bind(source, { count: alias }));
  expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<
    "count" | "local"
  >();
  expectTypeOf(imported.scope.values.count).toEqualTypeOf<Count | undefined>();
  expectTypeOf(imported.scope.values.local).toEqualTypeOf<Count | undefined>();
  expect(names(imported.scope.values)).toStrictEqual([expected]);
};
const checkSameName = (alias: "_" | "count"): void => {
  const imported = Result.getOrThrow(Import.bind(source, { count: alias }));
  expectTypeOf(imported.scope.values.count).toEqualTypeOf<Count>();
  expect(names(imported.scope.values)).toStrictEqual(["count"]);
};

const checkList = (selection: readonly ("count" | "text")[]): void => {
  const imported = Result.getOrThrow(Import.bind(source, selection));
  expectTypeOf(imported.scope.values.count).toEqualTypeOf<Count | undefined>();
  expectTypeOf(imported.scope.values.text).toEqualTypeOf<Text | undefined>();
  expect(names(imported.scope.values)).toStrictEqual(selection);
};
const checkTuple = (selection: readonly ["count" | "text"]): void => {
  const imported = Result.getOrThrow(Import.bind(source, selection));
  expectTypeOf(imported.scope.values.count).toEqualTypeOf<Count | undefined>();
  expectTypeOf(imported.scope.values.text).toEqualTypeOf<Text | undefined>();
  expect(names(imported.scope.values)).toStrictEqual(selection);
};
const checkMixedTuple = (
  selection: readonly ["count", ...("count" | "text")[]],
): void => {
  const imported = Result.getOrThrow(Import.bind(source, selection));
  expectTypeOf(imported.scope.values.count).toEqualTypeOf<Count>();
  expectTypeOf(imported.scope.values.text).toEqualTypeOf<Text | undefined>();
  expect(names(imported.scope.values)).toStrictEqual(selection);
};

const checkOptional = (
  selection: { readonly count?: "local" },
  expected: readonly string[],
): void => {
  const imported = Result.getOrThrow(Import.bind(source, selection));
  expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<"local">();
  expectTypeOf(imported.scope.values.local).toEqualTypeOf<Count | undefined>();
  expectTypeOf(Namespace.flatten(imported.scope).local).toEqualTypeOf<
    Count | undefined
  >();
  expect(names(imported.scope.values)).toStrictEqual(expected);
};

const checkUnion = (
  selection: { count: "local" } | { text: "label" },
  expected: string,
): void => {
  const imported = Result.getOrThrow(Import.bind(source, selection));
  expectTypeOf<keyof typeof imported.scope.values>().toEqualTypeOf<
    "local" | "label"
  >();
  expectTypeOf(imported.scope.values.local).toEqualTypeOf<Count | undefined>();
  expectTypeOf(imported.scope.values.label).toEqualTypeOf<Text | undefined>();
  expect(names(imported.scope.values)).toStrictEqual([expected]);
};
const checkCommon = (
  selection: { count: "local" } | { text: "local" },
): void => {
  const imported = Result.getOrThrow(Import.bind(source, selection));
  expectTypeOf(imported.scope.values.local).toExtend<Count | Text>();
  expectTypeOf<undefined>().not.toExtend<typeof imported.scope.values.local>();
  expectTypeOf<
    Program.Expression.Value.Type<typeof imported.scope.values.local>
  >().toEqualTypeOf<Type.PrimitiveInteger | Type.PrimitiveString>();
  expect(names(imported.scope.values)).toStrictEqual(["local"]);
};

const identity = Symbol("Item");
type Item = Type.Opaque<typeof identity, Type.PrimitiveInteger>;
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
const one = 1n;
const two = 2n;
const checkCapabilities = (
  selection: readonly ("math" | "List" | "equal" | "Item" | "create")[],
  expectedModules: readonly string[],
): void => {
  const imported = Result.getOrThrow(Import.bind(capabilities, selection));
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
  if (flat.math !== undefined) {
    expectTypeOf(flat.math.add(one, two)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
  }
  if (flat.List !== undefined) {
    expectTypeOf(flat.List(String)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
  }
  if (flat.equal !== undefined) {
    expectTypeOf(flat.equal(one, "text")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
  }
  if (flat.Item !== undefined) {
    expectTypeOf(Structural.type(flat.Item)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
  }
  if (flat.create !== undefined) {
    expectTypeOf(flat.create(one)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
  }
  expect(names(imported.scope.modules)).toStrictEqual(expectedModules);
};

const checkBroadAlias = (alias: string): void => {
  const imported = Result.getOrThrow(Import.bind(source, { count: alias }));
  expectTypeOf(imported.scope.values["local"]).toEqualTypeOf<
    Count | undefined
  >();
  expect(names(imported.scope.values)).toStrictEqual([alias]);
};

const checkOptionalSource = (values: {
  readonly count?: typeof source.values.count;
}): void => {
  const optionalSource = Result.getOrThrow(
    Module.define("::optional", { values }),
  );
  const imported = Result.getOrThrow(
    Import.bind(optionalSource, { count: "local" }),
  );
  expectTypeOf(imported.scope.values.local).toEqualTypeOf<Count | undefined>();
  expectTypeOf(Namespace.flatten(imported.scope).local).toEqualTypeOf<
    Count | undefined
  >();
  expect(names(imported.scope.values)).toHaveLength(names(values).length);
};

const correlated = Result.getOrThrow(
  Module.define("::correlated", {
    modules: { Item: Prelude.builtin.modules.math },
    types: { Item: Module.type<Item>() },
    values: {
      Item: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Item>
      >(),
    },
  }),
);
const joined = Namespace.flatten(
  Result.getOrThrow(Import.bind(correlated, "*")).scope,
).Item;
const checkCorrelated = (selection: readonly "Item"[]): void => {
  const imported = Result.getOrThrow(Import.bind(correlated, selection));
  const flat = Namespace.flatten(imported.scope);
  expectTypeOf(flat.Item).toEqualTypeOf<typeof joined | undefined>();
  if (flat.Item !== undefined) {
    expectTypeOf(flat.Item(one)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
    expectTypeOf(flat.Item(source.values.count)).toEqualTypeOf<
      Program.Expression.Expression<
        Item,
        { readonly count: Type.PrimitiveInteger }
      >
    >();
    expectTypeOf(flat.Item.add(one, two)).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveInteger, Program.Inputs.Empty>
    >();
    expectTypeOf(Structural.type(flat.Item)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
    expect(Program.TypeExpression.isExport(flat.Item)).toBe(true);
    expect(Expression.isExpression(flat.Item)).toBe(true);
  }
  expect(Object.keys(flat)).toStrictEqual(selection);
};

const checkCorrelatedAliases = (
  selection: { readonly Item?: "_" | "local" },
  expected: readonly string[],
): void => {
  const flat = Namespace.flatten(
    Result.getOrThrow(Import.bind(correlated, selection)).scope,
  );
  expectTypeOf(flat.Item).toEqualTypeOf<typeof joined | undefined>();
  expectTypeOf(flat.local).toEqualTypeOf<typeof joined | undefined>();
  if (flat.local !== undefined) {
    expectTypeOf(flat.local(one)).toEqualTypeOf<
      Program.Expression.Expression<Item, Program.Inputs.Empty>
    >();
    expectTypeOf(Structural.type(flat.local)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Item>
    >();
    expect(Module.isModule(flat.local)).toBe(true);
  }
  expect(Object.keys(flat)).toStrictEqual(expected);
};

const genericSource = Result.getOrThrow(
  Module.define("::generic", {
    types: { Generic: Prelude.builtin.types.List },
    values: { Generic: Prelude.builtin.modules.cmp.values.eq },
  }),
);
const checkGenericCorrelation = (selection: readonly "Generic"[]): void => {
  const flat = Namespace.flatten(
    Result.getOrThrow(Import.bind(genericSource, selection)).scope,
  );
  if (flat.Generic !== undefined) {
    expectTypeOf(flat.Generic(String)).toEqualTypeOf<
      Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
    >();
    expectTypeOf(flat.Generic(one, "text")).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
    expect(Program.TypeExpression.isConstructor(flat.Generic)).toBe(true);
    expect(Expression.isExpression(flat.Generic)).toBe(true);
  }
  expect(Object.keys(flat)).toStrictEqual(selection);
};

const separate = Result.getOrThrow(
  Module.define("::separate", {
    types: { Kind: Module.type<Item>() },
    values: {
      create:
        Module.value<Type.Function<readonly [Type.PrimitiveInteger], Item>>(),
    },
  }),
);
const checkDifferentSources = (
  selection: { Kind: "local" } | { create: "local" },
): void => {
  const imported = Result.getOrThrow(Import.bind(separate, selection));
  const flat = Namespace.flatten(imported.scope);
  if (flat.local !== undefined) {
    // @ts-expect-error A shared alias does not establish a value capability.
    expectTypeOf(flat.local).toExtend<typeof separate.values.create>();
    // @ts-expect-error A shared alias does not establish a type capability.
    expectTypeOf(flat.local).toExtend<typeof separate.types.Kind>();
  }
  expect(Expression.isExpression(flat.local)).toBe("create" in selection);
  expect(Program.TypeExpression.isExport(flat.local)).toBe("Kind" in selection);
};

const independentJoined = Namespace.combine(
  correlated.values.Item,
  correlated.types.Item,
);
const checkIndependent = (scope: {
  readonly types: { readonly Item?: typeof correlated.types.Item };
  readonly values: { readonly Item?: typeof correlated.values.Item };
}): void => {
  const flat = Namespace.flatten({ modules: {}, ...scope });
  if (flat.Item !== undefined) {
    // @ts-expect-error Ordinary scopes do not promise that optional capabilities arrive together.
    expectTypeOf(flat.Item).toExtend<typeof independentJoined>();
  }
  expect(Expression.isExpression(flat.Item)).toBe(
    scope.values.Item !== undefined,
  );
  expect(Program.TypeExpression.isExport(flat.Item)).toBe(
    scope.types.Item !== undefined,
  );
  const optional = Result.getOrThrow(Module.define("::optional", scope));
  const imported = Result.getOrThrow(Import.bind(optional, ["Item"]));
  const selected = Namespace.flatten(imported.scope);
  if (selected.Item !== undefined) {
    // @ts-expect-error Selecting a source does not make its optional exports required.
    expectTypeOf(selected.Item).toExtend<typeof independentJoined>();
  }
  expect(Expression.isExpression(selected.Item)).toBe(
    scope.values.Item !== undefined,
  );
  expect(Program.TypeExpression.isExport(selected.Item)).toBe(
    scope.types.Item !== undefined,
  );
};

describe("import_presence", () => {
  test("same_source_capabilities_arrive_together", () => {
    expect.hasAssertions();
    checkCorrelated([]);
    checkCorrelated(["Item"]);
    checkCorrelatedAliases({}, []);
    checkCorrelatedAliases({ Item: "_" }, ["Item"]);
    checkCorrelatedAliases({ Item: "local" }, ["local"]);
    checkGenericCorrelation([]);
    checkGenericCorrelation(["Generic"]);
  });

  test("different_sources_and_optional_exports_remain_independent", () => {
    expect.hasAssertions();
    checkDifferentSources({ Kind: "local" });
    checkDifferentSources({ create: "local" });
    checkIndependent({ types: {}, values: {} });
    checkIndependent({ types: { Item: correlated.types.Item }, values: {} });
    checkIndependent({ types: {}, values: { Item: correlated.values.Item } });
    checkIndependent({
      types: { Item: correlated.types.Item },
      values: { Item: correlated.values.Item },
    });
  });

  test("alias_alternatives_are_optional", () => {
    expect.hasAssertions();
    checkAlias("first");
    checkAlias("second");
  });

  test("sentinel_alternatives_use_the_source_name", () => {
    expect.hasAssertions();
    checkSentinel("_", "count");
    checkSentinel("local", "local");
    checkSameName("_");
    checkSameName("count");
  });

  test("widened_lists_and_union_slots_are_optional", () => {
    expect.hasAssertions();
    checkList([]);
    checkList(["count"]);
    checkList(["count", "text"]);
    checkTuple(["count"]);
    checkTuple(["text"]);
    checkMixedTuple(["count"]);
    checkMixedTuple(["count", "text"]);
  });

  test("optional_aliases_keep_possible_names", () => {
    expect.hasAssertions();
    checkOptional({}, []);
    checkOptional({ count: "local" }, ["local"]);
  });

  test("selection_unions_keep_possible_keys_and_guaranteed_common_names", () => {
    expect.hasAssertions();
    checkUnion({ count: "local" }, "local");
    checkUnion({ text: "label" }, "label");
    checkCommon({ count: "local" });
    checkCommon({ text: "local" });
  });

  test("optional_names_keep_each_namespace_capability", () => {
    expect.hasAssertions();
    checkCapabilities([], []);
    checkCapabilities(["math", "List", "equal", "Item", "create"], ["math"]);
  });

  test("broad_alias_and_optional_source_preserve_uncertainty", () => {
    expect.hasAssertions();
    checkBroadAlias("local");
    checkOptionalSource({});
    checkOptionalSource({ count: source.values.count });
  });
});

describe("import_bindings", () => {
  test("frozen_bindings", () => {
    expect.hasAssertions();
    const imported = Result.getOrThrow(Import.bind(correlated, "*"));
    expectTypeOf(imported.scope).toExtend<
      Program.Import.Bindings.Bindings<typeof correlated, "*">
    >();
    expect([
      Object.isFrozen(imported.scope),
      Object.isFrozen(imported.scope.types),
      Object.isFrozen(imported.scope.values),
      Object.isFrozen(imported.scope.modules),
    ]).toStrictEqual([true, true, true, true]);
    expect(() => Object.assign(imported.scope, { values: {} })).toThrow(
      TypeError,
    );
    expect(() =>
      Object.defineProperty(imported.scope, "values", { value: {} }),
    ).toThrow(TypeError);
  });

  test("type_only_export", () => {
    expect.hasAssertions();
    expect(Object.hasOwn(Import, "Bindings")).toBe(false);
  });

  test("ordinary_records_remain_conservative", () => {
    expect.hasAssertions();
    const scope = {
      modules: {},
      types: { Item: correlated.types.Item },
      values: {},
    };
    const { Item: item } = Namespace.flatten(scope);
    expectTypeOf(item).not.toExtend<typeof joined>();
    expect(Program.TypeExpression.isExport(item)).toBe(true);
    expect(Expression.isExpression(item)).toBe(false);
  });
});
