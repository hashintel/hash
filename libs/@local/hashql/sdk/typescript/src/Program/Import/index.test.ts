import { Equal, Function, Hash, Record, Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { Relocate, relocate } from "../../internal/relocation.js";
import * as JExpr from "../../JExpr/index.js";
import * as AST from "../AST/index.js";
import * as Program from "../index.js";

import type * as Type from "../../Type.js";

const { Expression, Import, Module, Namespace, Prelude, Scope, Structural } =
  Program;
const child = Result.getOrThrow(
  Module.define("::child", {
    values: { count: Module.value<Type.PrimitiveInteger>() },
  }),
);
const source = Result.getOrThrow(
  Module.define("::source", {
    modules: { Item: child },
    types: { Item: Module.type<Type.PrimitiveInteger>() },
    values: {
      Item: Module.value<
        Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveInteger>
      >(),
      other: Module.value<Type.PrimitiveString>(),
    },
  }),
);

const exports = {
  hidden: Module.value<Type.PrimitiveInteger>(),
  ["__proto__"]: Module.value<Type.PrimitiveInteger>(),
  constructor: Module.value<Type.PrimitiveInteger>(),
  toString: Module.value<Type.PrimitiveInteger>(),
};
const unusual = Result.getOrThrow(
  Module.define("::unusual", { values: exports }),
);

/** Compiles a trusted expression fixture. */
const compile = (value: Program.Expression.Expression.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(value)));

/** Wraps a literal to expose the import's emitted selection. */
const syntax = <M extends Program.Module.Module.Any, I>(
  declaration: Program.Import.Declaration<M, I>,
): string =>
  pipe(
    Expression.integer(1),
    Expression.toNode,
    Result.getOrThrow,
    declaration.wrap,
    AST.compile,
    JExpr.compile,
  );

describe("import_selection", () => {
  test("wildcard_and_name_list", () => {
    expect.hasAssertions();
    const wildcard = Result.getOrThrow(Import.bind(source, "*"));
    expect(Record.keys(wildcard.scope.values)).toStrictEqual(["Item", "other"]);
    expect(syntax(wildcard)).toBe(
      '["::kernel::special_form::use","::source","*",{"#literal":1}]',
    );
    const listed = Result.getOrThrow(
      Import.bind(source, ["other", "Item", "other"]),
    );
    expect(syntax(listed)).toBe(
      '["::kernel::special_form::use","::source",{"#tuple":["other","Item"]},{"#literal":1}]',
    );
    expect(compile(listed.scope.values.Item(1n))).toBe(
      '["Item",{"#literal":1}]',
    );
    expect(syntax(Result.getOrThrow(Import.bind(source, [])))).toBe(
      '["::kernel::special_form::use","::source",{"#tuple":[]},{"#literal":1}]',
    );
  });

  test("alias_all_namespaces", () => {
    expect.hasAssertions();
    const imported = Result.getOrThrow(
      Import.bind(source, { Item: "Local", other: "_" }),
    );
    const { Local } = Namespace.flatten(imported.scope);
    expect(compile(Local(1n))).toBe('["Local",{"#literal":1}]');
    expect(compile(Local.count)).toBe('"Local::count"');
    expect(
      JExpr.Type.compile(
        Result.getOrThrow(
          Result.flatMap(Structural.type(Local), Program.TypeExpression.toType),
        ),
      ),
    ).toBe("Local");
    expect(compile(imported.scope.values.other)).toBe('"other"');
    expect(syntax(imported)).toBe(
      '["::kernel::special_form::use","::source",{"#struct":{"Item":"Local","other":"other"}},{"#literal":1}]',
    );
  });

  test("joined_import_relocation", () => {
    expect.hasAssertions();
    const imported = Result.getOrThrow(Import.bind(source, { Item: "Local" }));
    const { Local } = Namespace.flatten(imported.scope);
    const moved = Result.getOrThrow(
      relocate(Local, Result.getOrThrow(JExpr.Path.parse("Again"))),
    );
    expect(compile(moved(2n))).toBe('["Again",{"#literal":2}]');
    expect(compile(moved.count)).toBe('"Again::count"');
    expect([Local.path, moved.path].every(Equal.isEqual)).toBe(true);
    expect(Hash.hash(moved.path)).toBe(
      Hash.hash(Result.getOrThrow(JExpr.Path.parse("Again"))),
    );
    expect(compile(source.values.Item(1n))).toBe(
      '["::source::Item",{"#literal":1}]',
    );
  });

  test("wildcard_unusual_names", () => {
    expect.hasAssertions();
    const wildcard = Result.getOrThrow(Import.bind(unusual, "*"));
    expect(Record.keys(wildcard.scope.values)).toStrictEqual([
      "hidden",
      "__proto__",
      "constructor",
      "toString",
    ]);
    const { __proto__: prototypeExport } = wildcard.scope.values;
    expect(compile(prototypeExport)).toBe('"__proto__"');
    const listed = Result.getOrThrow(Import.bind(unusual, ["hidden"]));
    expect(Record.keys(listed.scope.values)).toStrictEqual(["hidden"]);
  });

  test("non_enumerable_module_entries", () => {
    expect.hasAssertions();
    // A structural module can supply tables without Module.define's enumerable snapshot.
    const module: typeof source = {
      ...source,
      modules: Object.defineProperty({ ...source.modules }, "Item", {
        enumerable: false,
      }),
      types: Object.defineProperty({ ...source.types }, "Item", {
        enumerable: false,
      }),
      values: Object.defineProperty({ ...source.values }, "Item", {
        enumerable: false,
      }),
      pipe: source.pipe.bind(source),
      [Equal.symbol]: source[Equal.symbol],
      [Hash.symbol]: source[Hash.symbol],
      [Relocate]: source[Relocate],
    };
    for (const [selection, expected] of [
      ["*", ["other"]],
      [["Item"], []],
      [{ Item: "Local" }, []],
    ] as const) {
      const imported = Result.getOrThrow(Import.bind(module, selection));
      expect(
        Record.keys<string, Program.Module.Module.Any>(imported.scope.modules),
      ).toStrictEqual([]);
      expect(
        Record.keys<string, Program.TypeExpression.Export>(
          imported.scope.types,
        ),
      ).toStrictEqual([]);
      expect(
        Record.keys<string, Program.Expression.Expression.Any>(
          imported.scope.values,
        ),
      ).toStrictEqual(expected);
    }
  });

  test("own_keys_and_non_enumerable_selection_entries", () => {
    expect.hasAssertions();
    const selection = {
      hidden: "__proto__",
      ["__proto__"]: "constructor",
      constructor: "renamed",
      toString: "stringify",
    } as const;
    Object.defineProperty(selection, "hidden", { enumerable: false });
    const aliases = Result.getOrThrow(Import.bind(unusual, selection));
    expect(Record.keys(aliases.scope.values)).toStrictEqual([
      "constructor",
      "renamed",
      "stringify",
    ]);
    expect(Object.hasOwn(aliases.scope.values, "__proto__")).toBe(false);
    expect(syntax(aliases)).toBe(
      '["::kernel::special_form::use","::unusual",{"#struct":{"__proto__":"constructor","constructor":"renamed","toString":"stringify"}},{"#literal":1}]',
    );
    expect(Object.isFrozen(aliases.scope.values)).toBe(true);
    expect({
      frozen: Object.isFrozen(selection),
      enumerable: Object.getOwnPropertyDescriptor(selection, "hidden")
        ?.enumerable,
    }).toStrictEqual({ frozen: false, enumerable: false });
  });

  test("inherited_selection_names", () => {
    expect.hasAssertions();
    const selection = { other: "local" } as const;
    Object.setPrototypeOf(selection, { Item: "inherited" });
    const imported = Result.getOrThrow(Import.bind(source, selection));
    expect(Record.keys(imported.scope.values)).toStrictEqual(["local"]);
    expect(Record.keys(imported.scope.modules)).toStrictEqual([]);
  });

  test("invalid_alias_causes", () => {
    expect.hasAssertions();
    for (const alias of ["", "not an identifier", "a::b", "<T>"]) {
      const result = Import.bind(source, { Item: alias });
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          reason: {
            _tag: "InvalidImportName",
            name: alias,
            cause: { _tag: "Encoding" },
          },
        },
      });
    }
    const selection: { Item?: string } = {};
    Object.defineProperty(selection, "Item", {
      value: undefined,
      enumerable: true,
    });
    expect(Import.bind(source, selection)).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidImportName", name: "undefined" } },
    });
    expect(syntax(Result.getOrThrow(Import.bind(source, { Item: "+" })))).toBe(
      '["::kernel::special_form::use","::source",{"#struct":{"Item":"`+`"}},{"#literal":1}]',
    );
  });

  test("duplicate_alias", () => {
    expect.hasAssertions();
    expect(Import.bind(source, { Item: "other", other: "_" })).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "DuplicateImportName", name: "other" } },
    });
    expect(Import.bind(source, { Item: "+", other: "`+`" })).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "DuplicateImportName", name: "`+`" } },
    });
  });

  test("symbol_keys", () => {
    expect.hasAssertions();
    const symbol = Symbol("Item");
    const record = { Item: "Local", [symbol]: "hidden" };
    const hidden = Object.defineProperty({ Item: "Local" }, symbol, {
      value: "hidden",
    });
    for (const selection of [record, hidden]) {
      const imported = Result.getOrThrow(Import.bind(source, selection));
      expect(Record.keys(imported.scope.values)).toStrictEqual(["Local"]);
    }
    const list = Object.assign(["Item"] as const, { [symbol]: "hidden" });
    const listed = Result.getOrThrow(Import.bind(source, list));
    expect(Record.keys(listed.scope.values)).toStrictEqual(["Item"]);
  });

  test("detached_wrap", () => {
    expect.hasAssertions();
    const imported = Result.getOrThrow(Import.bind(source, { Item: "Local" }));
    const second = Result.getOrThrow(Import.bind(source, ["other"]));
    const { wrap } = imported;
    const wrapped = Result.getOrThrow(
      Result.map(Expression.toNode(Expression.integer(1)), wrap),
    );
    expect(JExpr.compile(AST.compile(wrapped))).toBe(syntax(imported));
    expect(Object.getPrototypeOf(imported)).toBe(Object.getPrototypeOf(second));
    expect(Object.getPrototypeOf(imported)).not.toBe(Object.prototype);
    expect(Object.isFrozen(imported)).toBe(true);
  });

  test("relocation_failure_identity", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Infinity);
    const failure = Result.getOrThrow(Result.flip(Expression.toJExpr(invalid)));
    const module = Result.getOrThrow(
      Module.define("::invalid", { values: { invalid } }),
    );
    expect(Result.getOrThrow(Result.flip(Import.bind(module, "*")))).toBe(
      failure,
    );
  });
});

const scalars = Result.getOrThrow(
  Module.define("::scalars", {
    values: {
      count: Expression.input(
        "count",
        Result.getOrThrow(Structural.type(BigInt)),
      ),
      text: Module.value<Type.PrimitiveString>(),
    },
  }),
);
const capabilities = Result.getOrThrow(
  Module.define("::capabilities", {
    modules: { math: Prelude.builtin.modules.math },
    types: {
      List: Prelude.builtin.types.List,
      Item: Module.type<Type.PrimitiveInteger>(),
    },
    values: {
      equal: Prelude.builtin.modules.cmp.values.eq,
      create: Module.value<Type.PrimitiveInteger>(),
    },
  }),
);

describe("import_presence", () => {
  test("absent_alias", () => {
    expect.hasAssertions();
    const alias = Function.identity<"local" | "toString">("local");
    const imported = Result.getOrThrow(Import.bind(scalars, { count: alias }));
    expect(imported.scope.values.toString).toBeUndefined();
  });

  test("selected_names", () => {
    expect.hasAssertions();
    for (const [selection, expected] of [
      [{ count: "first" }, ["first"]],
      [{ count: "_" }, ["count"]],
      [{ count: "local" }, ["local"]],
      [{}, []],
      [{ text: "label" }, ["label"]],
      [{ text: "local" }, ["local"]],
      [[], []],
      [["count"], ["count"]],
      [["text"], ["text"]],
      [
        ["count", "text"],
        ["count", "text"],
      ],
    ] as const) {
      const imported = Result.getOrThrow(Import.bind(scalars, selection));
      expect(Scope.universeKeys(imported.scope.values)).toStrictEqual(expected);
    }
  });

  test("optional_capabilities", () => {
    expect.hasAssertions();
    for (const [selection, expected] of [
      [[], []],
      [["math", "List", "equal", "Item", "create"], ["math"]],
    ] as const) {
      const imported = Result.getOrThrow(Import.bind(capabilities, selection));
      expect(Scope.universeKeys(imported.scope.modules)).toStrictEqual(
        expected,
      );
    }
  });

  test("optional_source", () => {
    expect.hasAssertions();
    for (const [values, expected] of [
      [{}, []],
      [{ count: scalars.values.count }, ["local"]],
    ] as const) {
      const optional = Result.getOrThrow(
        Module.define("::optional", { values }),
      );
      const imported = Result.getOrThrow(
        Import.bind(optional, { count: "local" }),
      );
      expect(Scope.universeKeys(imported.scope.values)).toStrictEqual(expected);
    }
  });
});
