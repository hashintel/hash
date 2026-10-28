/**
 * Runtime checks for Draft programs, covering declaration order, branch scopes, the input and prelude boundaries, imports, flattened views and callback failures.
 *
 * @module
 */
import { Cause, Option, Result, Schema, pipe } from "effect";
// oxlint-disable unicorn/no-thenable -- then names a HashQL branch or a declared export
import { assert, describe, expect, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Program from "../Program/index.js";
import * as Draft from "./index.js";

import type * as Type from "../Type.js";

const {
  Expression,
  Module,
  Namespace,
  Operators,
  Prelude,
  Structural,
  TypeExpression,
} = Program;

/** A built program root, or the failure that stopped it. */
type Built = Result.Result<
  Program.Expression.Expression.Any,
  Program.ProgramError.Construction
>;

/** Compiles a program's root to J-Expr text. */
const text = (result: Built): string =>
  pipe(
    result,
    Result.flatMap(Expression.toJExpr),
    Result.map(JExpr.compile),
    Result.getOrThrow,
  );

/** Compiles a program's root and parses the J-Expr, for comparison by structure. */
const syntax = (result: Built): Schema.Json =>
  pipe(
    text(result),
    // oxlint-disable-next-line effecttsgo/schema-sync -- malformed emitted JSON must fail this synchronous test helper
    Schema.decodeSync(Schema.fromJsonString(Schema.Json)),
  );

/** The J-Expr of a call to `name` with `args`. */
const call = (name: string, ...args: readonly Schema.Json[]): Schema.Json => [
  name,
  ...args,
];

/** The J-Expr of a literal. */
const literal = (value: string | number | boolean): Schema.Json => ({
  "#literal": value,
});

const integer = Result.getOrThrow(Structural.type(BigInt));

/** The reason a program failed with, for comparison by structure. */
const reason = (result: Built): Program.ProgramError.Construction["reason"] => {
  assert(Result.isFailure(result));
  return result.failure.reason;
};

/** The reason a program fails with when it uses a handle of `name` out of scope. */
const stale = (name: string): Program.ProgramError.Construction["reason"] =>
  Program.ProgramError.Reason.make({ _tag: "StaleReference", name });

// oxlint-disable-next-line typescript/promise-function-async -- this fixture supplies a Promise where the synchronous API rejects one
const asynchronousBody = (): Promise<
  Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
> => Promise.resolve(Expression.literal(true));

/** The signature of a generic function that returns its argument. */
interface IdentitySignature extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.Function<readonly [T], T>
    : Type.Function<readonly [Type.Never], Type.Never>;
}

/** A type constructor that makes a list of its one argument. */
interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.List<T>
    : Type.Never;
}

const leaf = Result.getOrThrow(
  Module.define("::leaf", {
    values: { enabled: Module.value<Type.PrimitiveBoolean>() },
  }),
);
const declarations = Result.getOrThrow(
  Module.define("::example", {
    modules: { child: leaf },
    types: {
      Whole: Module.type<Type.PrimitiveInteger>(),
      List: Prelude.builtin.types.List,
    },
    values: {
      Whole:
        Module.value<
          Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveInteger>
        >(),
    },
  }),
);
const child = Result.getOrThrow(
  Module.define("::child", {
    values: {
      name: Module.value<Type.PrimitiveInteger>(),
      then: Module.value<Type.PrimitiveInteger>(),
      $: Module.value<Type.PrimitiveInteger>(),
    },
    types: { ["__proto__"]: Module.type<Type.PrimitiveInteger>() },
  }),
);
/** Exports another module as `child`, so importing `child` from both modules binds that name twice. */
const rival = Result.getOrThrow(
  Module.define("::rival", { modules: { child } }),
);

/**
 * Imports a newtype through a module that exports it in both tables, and shadows its value binding when `shadow` holds.
 *
 * Both tables hold one joined handle, whose type and value halves each keep the id of their own universe.
 */
const importedNominal = (shadow: boolean): Built =>
  Draft.program({}, ($) => {
    const Box = $.newtype("Box", BigInt);
    const library = Result.getOrThrow(
      Module.define("::library", { types: { Box }, values: { Box } }),
    );
    const imported = $.import(library, ["Box"]).Box;
    if (shadow) {
      $.let("Box", 1n);
    }

    return Structural.tuple([imported(2n), Structural.list(imported, [])]);
  });

describe("program", () => {
  test("ordered_declarations", () => {
    expect.hasAssertions();
    let calls = 0;
    const result = Draft.program({}, ($) => {
      calls += 1;
      const Count = $.type("Count", BigInt);
      const Foo = $.newtype("Foo", { foo: Count });
      const value = $.let("value", Foo({ foo: 2n }));
      expect(TypeExpression.isExport(Foo)).toBe(true);
      expect(Expression.isExpression(Foo)).toBe(true);
      expect(TypeExpression.isExport(Count)).toBe(true);
      return value;
    });
    const output = pipe(
      result,
      Result.getOrThrow,
      Program.program,
      Program.compile,
      Result.getOrThrow,
    );
    expect(JSON.parse(output)).toStrictEqual(
      call(
        "::kernel::special_form::type",
        "Count",
        "::kernel::type::Integer",
        call(
          "::kernel::special_form::newtype",
          "Foo",
          { "#struct": { foo: "Count" } },
          call(
            "::kernel::special_form::let",
            "value",
            call("Foo", { "#struct": { foo: literal(2) } }),
            "value",
          ),
        ),
      ),
    );
    expect(calls).toBe(1);
  });

  test("host_value_newtype", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const Flag = $.newtype("Flag", { enabled: Boolean, label: String });
      return Flag({ enabled: true, label: "on" });
    });
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::newtype",
        "Flag",
        {
          "#struct": {
            enabled: "::kernel::type::Boolean",
            label: "::kernel::type::String",
          },
        },
        call("Flag", {
          "#struct": { enabled: literal(true), label: literal("on") },
        }),
      ),
    );
  });

  test("branch_collectors", () => {
    expect.hasAssertions();
    const visits: string[] = [];
    const result = Draft.program({}, ($) =>
      $.if(false, {
        then: (branch) => {
          visits.push("then");
          return branch.let("inside", branch.literal(1n));
        },
        else: (branch) => {
          visits.push("else");
          return branch.let("other", branch.literal(2n));
        },
      }),
    );
    expect(visits).toStrictEqual(["then", "else"]);
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::if",
        literal(false),
        call("::kernel::special_form::let", "inside", literal(1), "inside"),
        call("::kernel::special_form::let", "other", literal(2), "other"),
      ),
    );
  });

  test("then_only", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) =>
      $.if(true, { then: (branch) => branch.let("inside", 1n) }),
    );
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::if",
        literal(true),
        call("::kernel::special_form::let", "inside", literal(1), "inside"),
      ),
    );
  });

  test("reentrant_collectors", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const outer = $.let("outer", 1n);
      const inner = Draft.program({}, (nested) => nested.let("inner", 2n));
      expect(syntax(inner)).toStrictEqual(
        call("::kernel::special_form::let", "inner", literal(2), "inner"),
      );
      return $.if(true, {
        then: (branch) =>
          branch.if(false, {
            then: (deeper) => deeper.let("deep", outer),
            else: () => outer,
          }),
        else: () => outer,
      });
    });
    expect(text(result)).not.toContain('"inner"');
    expect(text(result)).toContain('"deep"');
  });

  test("detached_members", () => {
    expect.hasAssertions();
    const result = Draft.program({ flag: Boolean }, ($, { flag }) => {
      const {
        prelude,
        modules,
        import: use,
        let: bind,
        type,
        newtype,
        if: choose,
      } = $;
      const { add } = prelude();
      const { sum } = use(modules().math, { add: "sum" });
      const Count = newtype("Count", type("Whole", BigInt));
      const total = bind("total", Count(sum(add(1n, 2n), 3n)));
      return choose(flag, { then: () => total, else: () => total });
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::core::math",{"#struct":{"add":"sum"}},["::kernel::special_form::type","Whole","::kernel::type::Integer",["::kernel::special_form::newtype","Count","Whole",["::kernel::special_form::let","total",["Count",["sum",["::core::math::add",{"#literal":1},{"#literal":2}],{"#literal":3}]],["::kernel::special_form::if",["::kernel::special_form::input","flag","::kernel::type::Boolean"],"total","total"]]]]]',
    );
  });

  test("structural_shorthand", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const { List: ListType, Dict, String: StringType, Integer } = $.prelude();
      $.type("Collections", {
        list: ListType(BigInt),
        dict: Dict(StringType, Integer),
        nested: ListType({ value: BigInt }),
        flag: Boolean,
        text: String,
        number: Number,
      });
      const Tuple = $.newtype("Tuple", [BigInt, String]);
      return Tuple([2n, "two"]);
    });
    expect(text(result)).toContain('"#tuple"');
    expect(text(result)).toContain(
      "::kernel::type::List<::kernel::type::Integer>",
    );
  });

  test("construction_failures", () => {
    expect.hasAssertions();
    for (const result of [
      Draft.program({}, ($) => {
        $.let("not a name", 1n);
        return $.literal(true);
      }),
      Draft.program({}, ($) => {
        $.let("bad", Infinity);
        return $.literal(true);
      }),
      Draft.program({}, ($) => {
        $.type("bad", { "not a field": BigInt });
        return $.literal(true);
      }),
      Draft.program({}, ($) => {
        $.newtype("Bad", { "+": BigInt, "`+`": String });
        return $.literal(true);
      }),
      Draft.program({}, ($) => {
        $.type("Bad", { "\u00E9": BigInt, "e\u0301": String });
        return $.literal(true);
      }),
      Draft.program({}, ($) =>
        $.if(true, {
          then: () => 1n,
          else: (branch) => {
            branch.let("bad", Number.NaN);
            return 2n;
          },
        }),
      ),
    ]) {
      expect(result._tag).toBe("Failure");
    }

    // @ts-expect-error exercise an unchecked JavaScript caller
    const asynchronous = Draft.program({}, asynchronousBody);
    expect(Result.isFailure(asynchronous)).toBe(true);
  });

  test("failed_type_declaration", () => {
    expect.hasAssertions();
    // @ts-expect-error The runtime call omits the required type argument.
    const invalid = Prelude.builtin.types.List();
    const alias = Draft.program({}, ($) => {
      $.type("Alias", invalid);
      return $.literal(true);
    });
    const nominal = Draft.program({}, ($) => {
      $.newtype("Nominal", invalid);
      return $.literal(true);
    });
    expect(alias).toStrictEqual(TypeExpression.toType(invalid));
    expect(nominal).toStrictEqual(TypeExpression.toType(invalid));
  });

  test("invalid_nominal", () => {
    expect.hasAssertions();
    const value = Draft.program({}, ($) => {
      const Bad = $.newtype("Bad", { number: Number });
      return Bad({ number: Infinity });
    });
    expect(Result.isFailure(value)).toBe(true);
    const declaration = Draft.program({}, ($) => {
      $.newtype("not a name", BigInt);
      return $.literal(true);
    });
    expect(Result.isFailure(declaration)).toBe(true);
  });

  test("schema_shorthand", () => {
    expect.hasAssertions();
    const result = Draft.program(
      { flag: Boolean, point: { width: Number, height: Number } },
      ($, { flag, point }) =>
        $.if(flag, { then: () => point.width, else: () => point.height }),
    );
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::if",
        call(
          "::kernel::special_form::input",
          "flag",
          "::kernel::type::Boolean",
        ),
        call(
          "::kernel::special_form::access",
          call("::kernel::special_form::input", "point", {
            "#struct": {
              width: "::kernel::type::Number",
              height: "::kernel::type::Number",
            },
          }),
          "width",
        ),
        call(
          "::kernel::special_form::access",
          call("::kernel::special_form::input", "point", {
            "#struct": {
              width: "::kernel::type::Number",
              height: "::kernel::type::Number",
            },
          }),
          "height",
        ),
      ),
    );
  });

  test("external_inputs", () => {
    expect.hasAssertions();
    const external = Expression.input("count", Prelude.builtin.types.Integer);
    const result = Draft.program(
      { count: Prelude.builtin.types.Integer },
      ($) => {
        $.let("unused", external);
        return $.literal(true);
      },
    );
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::let",
        "unused",
        call(
          "::kernel::special_form::input",
          "count",
          "::kernel::type::Integer",
        ),
        literal(true),
      ),
    );
  });

  test("escaped_references", () => {
    expect.hasAssertions();
    let escaped: Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = Expression.integer(0);
    Draft.program({}, ($) => {
      escaped = $.let("local", 1n);
      return escaped;
    });
    expect(reason(Draft.program({}, () => escaped))).toStrictEqual(
      stale("local"),
    );
  });
});

describe("references", () => {
  test("reused_let", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const first = $.let("v", 1n);
      $.let("v", "text");
      return first;
    });
    expect(reason(result)).toStrictEqual(stale("v"));
  });

  test("canonical_equivalence", () => {
    expect.hasAssertions();
    // HashQL normalizes the precomposed and the combining spelling of "é" to one name, so the second binding shadows the first.
    for (const [first, second] of [
      ["\u00E9", "e\u0301"],
      ["e\u0301", "\u00E9"],
    ] as const) {
      const result = Draft.program({}, ($) => {
        const old = $.let(first, 1n);
        $.let(second, 2n);
        return old;
      });
      expect(reason(result)).toStrictEqual(stale(first));
    }
  });

  test("before_after", () => {
    expect.hasAssertions();
    // Without the check this emits `eq(n, n)`, which is true for every limit.
    const result = Draft.program({ limit: BigInt }, ($, { limit }) => {
      const { add } = $.prelude();
      const before = $.let("n", limit);
      const after = $.let("n", add(before, 1n));
      return $.eq(before, after);
    });
    expect(reason(result)).toStrictEqual(stale("n"));
  });

  test("let_annotation", () => {
    expect.hasAssertions();
    const annotated = Draft.program({}, ($) => $.let("x", 1n, Number));
    expect(text(annotated)).toBe(
      '["::kernel::special_form::let","x","::kernel::type::Number",{"#literal":1},"x"]',
    );

    // The annotation names a type binding, which the check follows like any other use.
    const shadowed = Draft.program({}, ($) => {
      const alias = $.type("T", BigInt);
      $.type("T", String);
      return $.let("x", 1n, alias);
    });
    expect(reason(shadowed)).toStrictEqual(stale("T"));
  });

  test("shadowing_initializer", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const { add } = $.prelude();
      const first = $.let("n", 1n);
      return $.let("n", add(first, 1n));
    });
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::let",
        "n",
        literal(1),
        call(
          "::kernel::special_form::let",
          "n",
          call("::core::math::add", "n", literal(1)),
          "n",
        ),
      ),
    );
  });

  test("helper_twice", () => {
    expect.hasAssertions();
    // Both `eq` calls read their `tmp` while it is the innermost one. The check still sees each reference inside the composite it built.
    const result = Draft.program({}, ($) => {
      const isZero = (
        value: bigint,
      ): Program.Operators.Predicate<Program.Inputs.Empty> =>
        $.eq($.let("tmp", value), 0n);
      return $.and(isZero(1n), isZero(2n));
    });
    expect(reason(result)).toStrictEqual(stale("tmp"));
  });

  test("branch_redeclaration", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const total = $.let("total", 1n);
      return $.if(true, {
        then: (branch) => {
          branch.let("total", 2n);
          return total;
        },
        else: () => total,
      });
    });
    expect(reason(result)).toStrictEqual(stale("total"));
  });

  test("branch_escape", () => {
    expect.hasAssertions();
    let inner: Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = Expression.integer(0);
    const result = Draft.program({}, ($) => {
      const conditional = $.if(true, {
        then: (branch) => {
          inner = branch.let("inner", 1n);
          return inner;
        },
      });
      return Structural.tuple([conditional, inner]);
    });
    expect(reason(result)).toStrictEqual(stale("inner"));
  });

  test("embedded_program", () => {
    expect.hasAssertions();
    // A program's root carries its own bindings, so its references resolve inside another program too.
    const inner = Result.getOrThrow(Draft.program({}, ($) => $.let("v", 1n)));
    const result = Draft.program({}, ($) => {
      $.let("v", "text");
      return inner;
    });
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::let",
        "v",
        literal("text"),
        call("::kernel::special_form::let", "v", literal(1), "v"),
      ),
    );
  });

  test("newtype_constructor", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const Old = $.newtype("Id", BigInt);
      $.newtype("Id", String);
      return Old(1n);
    });
    expect(reason(result)).toStrictEqual(stale("Id"));
  });

  test("newtype_shadows_value", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const flag = $.let("Flag", true);
      $.newtype("Flag", Boolean);
      return flag;
    });
    expect(reason(result)).toStrictEqual(stale("Flag"));
  });

  test("universes", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const value = $.let("T", 1n);
      $.type("T", BigInt);
      return value;
    });
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::let",
        "T",
        literal(1),
        call(
          "::kernel::special_form::type",
          "T",
          "::kernel::type::Integer",
          "T",
        ),
      ),
    );

    // Each universe counts its own bindings, so the value is the second `T` and the type the first.
    const counted = Draft.program({}, ($) => {
      $.let("T", 0n);
      const second = $.let("T", 1n);
      $.type("T", BigInt);
      return second;
    });
    expect(Result.isSuccess(counted)).toBe(true);

    const type = Draft.program({}, ($) => {
      const alias = $.type("T", BigInt);
      $.let("T", 1n);
      return Structural.list(alias, []);
    });
    expect(syntax(type)).toStrictEqual(
      call(
        "::kernel::special_form::type",
        "T",
        "::kernel::type::Integer",
        call("::kernel::special_form::let", "T", literal(1), {
          "#list": [],
          "#type": "::kernel::type::List<T>",
        }),
      ),
    );
  });

  test("reused_type", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const first = $.type("T", BigInt);
      $.type("T", String);
      return Structural.list(first, []);
    });
    expect(reason(result)).toStrictEqual(stale("T"));
  });

  test("recursive_definition", () => {
    expect.hasAssertions();
    // A definition sees its own name, so both emit the recursive `T = (T, String)` rather than a pair of an integer and a string.
    const type = Draft.program({}, ($) => {
      const first = $.type("T", BigInt);
      $.type("T", [first, String]);
      return $.literal(true);
    });
    const nominal = Draft.program({}, ($) => {
      const first = $.type("T", BigInt);
      $.newtype("T", [first, String]);
      return $.literal(true);
    });
    expect(reason(type)).toStrictEqual(stale("T"));
    expect(reason(nominal)).toStrictEqual(stale("T"));
  });

  test("newtype_type", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const Old = $.newtype("Id", BigInt);
      $.newtype("Id", String);
      return Structural.dict(String, Old, []);
    });
    expect(reason(result)).toStrictEqual(stale("Id"));
  });

  test("constructor_argument", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const { List: ListType } = $.prelude();
      const first = $.type("T", BigInt);
      $.type("T", String);
      $.type("Items", ListType(first));
      return $.literal(true);
    });
    expect(reason(result)).toStrictEqual(stale("T"));
  });

  test("input_annotation", () => {
    expect.hasAssertions();
    const result = Draft.program({ count: BigInt }, ($) => {
      const first = $.type("T", BigInt);
      $.type("T", String);
      return $.let("count", Expression.input("count", first));
    });
    expect(reason(result)).toStrictEqual(stale("T"));
  });

  test("escaped_type", () => {
    expect.hasAssertions();
    let escaped = integer;
    const branch = Draft.program({}, ($) => {
      const conditional = $.if(true, {
        then: (inner) => {
          escaped = inner.type("Inner", BigInt);
          return 1n;
        },
      });
      return Structural.tuple([conditional, Structural.list(escaped, [])]);
    });
    Draft.program({}, ($) => {
      escaped = $.type("Local", BigInt);
      return $.literal(true);
    });
    const other = Draft.program({}, () => Structural.list(escaped, []));
    expect(reason(branch)).toStrictEqual(stale("Inner"));
    expect(reason(other)).toStrictEqual(stale("Local"));
  });

  test("imported_shadowed", () => {
    expect.hasAssertions();
    const value = Draft.program({}, ($) => {
      const { Whole } = $.import(declarations, ["Whole"]);
      $.let("Whole", 1n);
      return Whole(2n);
    });
    expect(reason(value)).toStrictEqual(stale("Whole"));

    const type = Draft.program({}, ($) => {
      const { Whole } = $.import(declarations, ["Whole"]);
      $.type("Whole", String);
      return Structural.list(Whole, []);
    });
    expect(reason(type)).toStrictEqual(stale("Whole"));

    // A value binding leaves the imported type in scope, because each universe keeps its own names.
    const universes = Draft.program({}, ($) => {
      const { Whole } = $.import(declarations, ["Whole"]);
      $.let("Whole", 1n);
      return Structural.list(Whole, []);
    });
    expect(Result.isSuccess(universes)).toBe(true);
  });

  test("imported_branch_escape", () => {
    expect.hasAssertions();
    let escaped: (
      value: bigint,
    ) => Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = Expression.integer;
    const result = Draft.program({}, ($) => {
      const conditional = $.if(true, {
        then: (branch) => {
          escaped = branch.import(declarations, ["Whole"]).Whole;
          return 1n;
        },
      });
      return Structural.tuple([conditional, escaped(1n)]);
    });
    expect(reason(result)).toStrictEqual(stale("Whole"));
  });

  test("imported_nominal", () => {
    expect.hasAssertions();
    expect(Result.isSuccess(importedNominal(false))).toBe(true);
    expect(reason(importedNominal(true))).toStrictEqual(stale("Box"));
  });

  test("imported_module", () => {
    expect.hasAssertions();
    const shadowed = Draft.program({}, ($) => {
      const { child: first } = $.import(declarations, ["child"]);
      $.import(rival, ["child"]);
      return first.enabled;
    });
    expect(reason(shadowed)).toStrictEqual(stale("child"));

    // A value binding never shadows a module, so `child::enabled` still reads the imported module.
    const value = Draft.program({}, ($) => {
      const { child: first } = $.import(declarations, ["child"]);
      $.let("child", 1n);
      return first.enabled;
    });
    expect(text(value)).toBe(
      '["::kernel::special_form::use","::example",{"#tuple":["child"]},["::kernel::special_form::let","child",{"#literal":1},"child::enabled"]]',
    );

    // An import through an imported module reads the module's binding in its own path.
    const nested = Draft.program({}, ($) => {
      const { child: first } = $.import(declarations, ["child"]);
      $.import(rival, ["child"]);
      return $.import(first, ["enabled"]).enabled;
    });
    expect(reason(nested)).toStrictEqual(stale("child"));
  });
});

describe("with_prelude", () => {
  test("custom_prelude", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Item: Module.type<Type.PrimitiveInteger>() },
        values: {
          Item: Module.value<
            Type.Function<
              readonly [Type.PrimitiveInteger],
              Type.PrimitiveInteger
            >
          >(),
        },
      }),
    );
    const originalKeys = Reflect.ownKeys(custom.types.Item);
    const { program } = Draft.withPrelude(custom);
    const result = program({}, ($) => {
      const { Item } = $.prelude();
      expect(TypeExpression.isExport(Item)).toBe(true);
      expect(Expression.isExpression(Item)).toBe(true);
      expect($.prelude()).not.toHaveProperty("Uuid");
      expect(Result.getOrThrow(TypeExpression.toType(Item))).toStrictEqual(
        Result.getOrThrow(TypeExpression.toType(custom.types.Item)),
      );
      return Item(2n);
    });
    expect(syntax(result)).toStrictEqual(call("::custom::Item", literal(2)));
    expect(Reflect.ownKeys(custom.types.Item)).toStrictEqual(originalKeys);
    expect(Object.isFrozen(custom.types)).toBe(true);
  });

  test("generic_value_collision", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Both: Module.genericType<Program.Prelude.List>(1) },
        values: {
          Both: Module.value<
            Type.Function<
              readonly [Type.PrimitiveInteger],
              Type.PrimitiveInteger
            >
          >(),
        },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      const { Both } = $.prelude();
      expect(TypeExpression.isExport(Both)).toBe(true);
      expect(Expression.isExpression(Both)).toBe(true);
      const specialized = Both(Prelude.builtin.types.Integer);
      expect(TypeExpression.isExport(specialized)).toBe(true);
      expect(Result.getOrThrow(TypeExpression.toType(specialized))._tag).toBe(
        "Reference",
      );
      return Both(2n);
    });
    expect(syntax(result)).toStrictEqual(call("::custom::Both", literal(2)));
  });

  test("three_namespace_collision", () => {
    expect.hasAssertions();
    const nested = Result.getOrThrow(
      Module.define("::custom::child", {
        types: { Integer: Module.type<Type.PrimitiveInteger>() },
      }),
    );
    const generic = Result.getOrThrow(
      Module.define("::custom", {
        types: { Both: Module.genericType<Program.Prelude.List>(1) },
        values: {
          Both: Module.value<Type.GenericFunction<IdentitySignature>>(),
        },
      }),
    );
    const built = Draft.withPrelude({
      types: generic.types,
      values: generic.values,
      modules: { Both: nested },
    }).program({}, ($) => {
      const { Both } = $.prelude();
      expect([
        Module.isModule(Both),
        TypeExpression.isConstructor(Both),
        Expression.isExpression(Both),
      ]).toStrictEqual([true, true, true]);
      expect([Both.types.Integer, $.modules().Both.Integer]).toStrictEqual([
        nested.types.Integer,
        nested.types.Integer,
      ]);
      const applied = Both(nested.types.Integer);
      expect(TypeExpression.isExport(applied)).toBe(true);
      const combinedArgument = Draft.withPrelude(Prelude.builtin).program(
        {},
        (inner) => {
          const result = Both(inner.prelude().Uuid);
          expect([
            TypeExpression.isExport(result),
            Expression.isExpression(result),
          ]).toStrictEqual([true, true]);
          return inner.literal(true);
        },
      );
      expect(Result.isSuccess(combinedArgument)).toBe(true);
      return Both(2n);
    });
    expect(syntax(built)).toStrictEqual(call("::custom::Both", literal(2)));
  });

  test("nested_nominal_export", () => {
    expect.hasAssertions();
    const library = Result.getOrThrow(
      Module.define("::custom::library", {
        modules: { entity: Prelude.builtin.modules.entity },
      }),
    );
    const root = Result.getOrThrow(
      Module.define("::custom", { modules: { library } }),
    );
    const result = Draft.withPrelude({
      modules: { root },
      values: { Uuid: Prelude.builtin.values.Uuid },
    }).program({}, ($) => {
      const EntityUuid = $.modules().root.library.entity.EntityUuid;
      expect(TypeExpression.isExport(EntityUuid)).toBe(true);
      expect(Expression.isExpression(EntityUuid)).toBe(true);
      expect(Module.isModule($.modules().root.library.entity)).toBe(true);
      const alias = $.type("Id", EntityUuid);
      expect(Result.isSuccess(TypeExpression.toType(alias))).toBe(true);
      return EntityUuid($.prelude().Uuid("uuid"));
    });
    expect(syntax(result)).toStrictEqual(
      call(
        "::kernel::special_form::type",
        "Id",
        "::graph::types::knowledge::entity::EntityUuid",
        call(
          "::graph::types::knowledge::entity::EntityUuid",
          call("::core::uuid::Uuid", literal("uuid")),
        ),
      ),
    );
  });

  test("metadata_projection", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Shared: Module.type<Type.PrimitiveInteger>() },
        values: {
          Shared:
            Module.value<
              Type.Struct<{ readonly syntax: Type.PrimitiveInteger }>
            >(),
        },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      const { Shared } = $.prelude();
      expect(Result.isSuccess(Shared.syntax)).toBe(true);
      expect(Result.isSuccess(TypeExpression.toType(Shared))).toBe(true);
      return Shared.$project("syntax");
    });
    expect(syntax(result)).toStrictEqual(
      call("::kernel::special_form::access", "::custom::Shared", "syntax"),
    );
  });

  test("prelude_snapshot", () => {
    expect.hasAssertions();
    const first = Expression.integer(1);
    const values = { value: first };
    const { program } = Draft.withPrelude({ values });
    expect(Object.isFrozen(values)).toBe(false);
    values.value = Expression.integer(2);
    const result = program({}, ($) => $.prelude().value);
    expect(text(result)).toBe('{"#literal":1}');
  });
});

describe("boundary", () => {
  test("symbol_keys", () => {
    expect.hasAssertions();
    const key = Symbol("hidden");
    const schema = { count: integer };
    Object.defineProperty(schema, key, { value: integer, enumerable: true });
    const values = { one: Expression.integer(1) };
    Object.defineProperty(values, key, {
      value: Expression.integer(2),
      enumerable: true,
    });
    const result = Draft.withPrelude({ values }).program(
      schema,
      ($, inputs) => {
        expect(Object.hasOwn(inputs, key)).toBe(false);
        expect(Object.hasOwn($.prelude(), key)).toBe(false);
        return $.prelude().one;
      },
    );
    expect(text(result)).toBe('{"#literal":1}');
  });

  test("input_own_names", () => {
    expect.hasAssertions();
    const schema = { count: integer, ["__proto__"]: integer };
    Object.defineProperty(schema, "count", { enumerable: false });
    const result = Draft.program(schema, (_, inputs) => {
      expect(Object.getPrototypeOf(inputs)).toBe(Object.prototype);
      expect(Object.hasOwn(inputs, "count")).toBe(false);
      // oxlint-disable-next-line eslint/no-proto -- this is a declared HashQL input, not the JavaScript prototype accessor
      return inputs.__proto__;
    });
    expect(text(result)).toContain('"__proto__"');
  });

  test("nominal_relocation", () => {
    expect.hasAssertions();
    const second = Result.getOrThrow(JExpr.Path.decodeResult("::second::Box"));
    const result = Draft.program({}, ($) => {
      const Box = $.newtype("Box", { value: BigInt });
      const module = pipe(
        Module.define("::test", { types: { Box }, values: { Box } }),
        Result.getOrThrow,
      );
      const joined = Namespace.flatten(module).Box;
      const first = pipe(
        joined,
        TypeExpression.relocate(
          Result.getOrThrow(JExpr.Path.decodeResult("::first::Box")),
        ),
        Result.getOrThrow,
      );
      const moved = pipe(
        first,
        TypeExpression.relocate(second),
        Result.getOrThrow,
      );
      expect(Expression.isExpression(moved)).toBe(true);
      expect(TypeExpression.isExport(moved)).toBe(true);
      expect(Result.getOrThrow(TypeExpression.toType(moved))).toStrictEqual({
        _tag: "Reference",
        path: second,
      });
      return moved({ value: 2n });
    });
    expect(text(result)).toContain(
      '["::second::Box",{"#struct":{"value":{"#literal":2}}}]',
    );
  });
});

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
const graph = Result.getOrThrow(
  Module.define("::graph::head", {
    values: {
      entities:
        Module.value<
          Type.Function<
            readonly [Type.PrimitiveInteger],
            Program.Query.Graph<Vertex>
          >
        >(),
    },
  }),
);

const axes = TypeExpression.fromType<Program.Query.QueryTemporalAxes>(
  Option.getOrThrow(
    JExpr.Type.reference("::graph::temporal::QueryTemporalAxes"),
  ),
);

describe("import", () => {
  test("selected_capabilities", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const { Whole, List: ListType } = $.import(declarations, [
        "Whole",
        "List",
      ]);
      expectTypeOf(Whole(1n)).toEqualTypeOf<
        Program.Expression.Expression<
          Type.PrimitiveInteger,
          Program.Inputs.Empty
        >
      >();
      expectTypeOf(ListType(String)).toEqualTypeOf<
        Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveString>>
      >();
      expect(
        JExpr.Type.compile(
          Result.getOrThrow(TypeExpression.toType(ListType(String))),
        ),
      ).toBe("List<::kernel::type::String>");
      expect(
        JExpr.Type.compile(Result.getOrThrow(TypeExpression.toType(Whole))),
      ).toBe("Whole");
      return Whole(1n);
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::example",{"#tuple":["Whole","List"]},["Whole",{"#literal":1}]]',
    );
  });

  test("wildcard_and_nested_module", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const imported = $.import(declarations);
      const { active } = $.import(imported.child, { enabled: "active" });
      expectTypeOf(active).toEqualTypeOf<typeof leaf.values.enabled>();
      return $.and(active, true);
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::example","*",["::kernel::special_form::use","child",{"#struct":{"enabled":"active"}},["::core::bool::and","active",{"#literal":true}]]]',
    );
  });

  test("branch_scope", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) =>
      $.if(true, {
        then: (branch) => {
          const { Whole } = branch.import(declarations, { Whole: "_" });
          return Whole(1n);
        },
        else: () => 0n,
      }),
    );
    expect(text(result)).toBe(
      '["::kernel::special_form::if",{"#literal":true},["::kernel::special_form::use","::example",{"#struct":{"Whole":"Whole"}},["Whole",{"#literal":1}]],{"#literal":0}]',
    );
  });

  test("adapted_callable", () => {
    expect.hasAssertions();
    const original = Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveString>,
      Program.Inputs.Empty
    >("::original");
    const adapted = Expression.adaptCallable(
      original,
      (self) =>
        (value: {
          readonly text: string;
        }): Program.Expression.Expression<
          Type.PrimitiveString,
          Program.Inputs.Empty
        > =>
          self(value.text),
    );
    const source = Result.getOrThrow(
      Module.define("::adapted", { values: { call: adapted } }),
    );
    const result = Draft.program({}, ($) => {
      const { invoke } = $.import(source, { call: "invoke" });
      expectTypeOf(invoke).toEqualTypeOf(adapted);
      return invoke({ text: "value" });
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::adapted",{"#struct":{"call":"invoke"}},["invoke",{"#literal":"value"}]]',
    );
  });

  test("symbol_alias", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      const imported = $.import(declarations, { Whole: "+" });
      expect(Object.hasOwn(imported, "+")).toBe(true);
      return imported["+"](1n);
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::example",{"#struct":{"Whole":"`+`"}},["`+`",{"#literal":1}]]',
    );
  });

  test("own_names", () => {
    expect.hasAssertions();
    const values = {
      ["__proto__"]: Expression.literal(true),
      hidden: Expression.literal(false),
    };
    const source = Result.getOrThrow(Module.define("::own", { values }));
    const result = Draft.program({}, ($) => {
      const imported = $.import(source);
      expect(Object.hasOwn(imported, "__proto__")).toBe(true);
      expect(Object.hasOwn(imported, "hidden")).toBe(true);
      const { __proto__: prototypeNamed } = imported;
      return $.and(prototypeNamed, imported.hidden);
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::own","*",["::core::bool::and","__proto__","hidden"]]',
    );
    expect(Object.isFrozen(values)).toBe(false);
  });

  test("repeated_alias", () => {
    expect.hasAssertions();
    const source = Result.getOrThrow(
      Module.define("::aliases", {
        values: {
          first: Module.value<Type.PrimitiveBoolean>(),
          second: Module.value<Type.PrimitiveBoolean>(),
        },
      }),
    );
    const result = Draft.program(
      {},
      ($) =>
        $.import(source, { first: "selected", second: "selected" }).selected,
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "DuplicateImportName", name: "selected" } },
    });
  });

  test("symbol_selection", () => {
    expect.hasAssertions();
    const hidden = Symbol("hidden");
    const selection = { Whole: "Whole", [hidden]: "hidden" };
    const result = Draft.program({}, ($) => {
      $.import(declarations, selection);
      return $.literal(true);
    });
    expect(text(result)).toContain('{"#struct":{"Whole":"Whole"}}');
    expect(text(result)).not.toContain("hidden");
  });

  test("invalid_alias", () => {
    expect.hasAssertions();
    let continued = false;
    const result = Draft.program({}, ($) => {
      const { "bad name": whole } = $.import(declarations, {
        Whole: "bad name",
      });
      continued = true;
      return whole(1n);
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidImportName", name: "bad name" } },
    });
    expect(continued).toBe(false);
  });

  test("caught_import_failure", () => {
    expect.hasAssertions();
    const result = Draft.program({}, ($) => {
      try {
        $.import(declarations, { Whole: "bad name" });
      } catch {
        /* The collector must still retain this construction failure. */
      }
      return $.literal(true);
    });
    expect(Result.isFailure(result)).toBe(true);
  });

  test("caught_branch_import", () => {
    expect.hasAssertions();
    const kept = Draft.program({}, ($) =>
      $.if(true, {
        then: (branch) => {
          try {
            branch.import(declarations, { Whole: "bad name" });
          } catch {
            /* The branch's collector retains this construction failure. */
          }
          return 1n;
        },
      }),
    );
    expect(kept).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidImportName", name: "bad name" } },
    });
    const discarded = Draft.program({}, ($) => {
      $.if(true, {
        then: (branch) => {
          try {
            branch.import(declarations, { Whole: "bad name" });
          } catch {
            /* The failure belongs to the conditional, which the program discards. */
          }
          return 1n;
        },
      });
      return $.literal(true);
    });
    expect(Result.isSuccess(discarded)).toBe(true);
  });

  test("host_exception", () => {
    expect.hasAssertions();
    const error = new Error("host callback");
    const result = Draft.program({}, ($) => {
      $.import(declarations);
      throw error;
    });
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: error } },
      },
    });
  });
});

describe("query", () => {
  test("imported_graph", () => {
    expect.hasAssertions();
    let calls = 0;
    const result = Draft.program(
      { axis: BigInt, flag: Boolean },
      ($, { axis, flag }) => {
        const { entities } = $.import(graph, ["entities"]);
        return $.query(entities(axis))
          .filter("vertex", (predicate, vertex) => {
            calls += 1;
            const selected = predicate.let("selected", vertex.enabled);
            return $.and(selected, flag);
          })
          .collect();
      },
    );
    expect(text(result)).toBe(
      '["::kernel::special_form::use","::graph::head",{"#tuple":["entities"]},["::graph::tail::collect",["::graph::body::filter",["entities",["::kernel::special_form::input","axis","::kernel::type::Integer"]],["fn",{"#tuple":[]},{"#struct":{"vertex":"_"}},"_",["::kernel::special_form::let","selected",["::kernel::special_form::access","vertex","enabled"],["::core::bool::and","selected",["::kernel::special_form::input","flag","::kernel::type::Boolean"]]]]]]]',
    );
    expect(calls).toBe(1);
  });

  test("prelude_graph", () => {
    expect.hasAssertions();
    const result = Draft.withPrelude(graph).program({}, ($) =>
      $.query($.prelude().entities(1n))
        .filter("first", () => true)
        .filter("second", (_, vertex) => $.isTrue(vertex.enabled))
        .collect(),
    );
    expect(text(result)).toBe(
      '["::graph::tail::collect",["::graph::body::filter",["::graph::body::filter",["::graph::head::entities",{"#literal":1}],["fn",{"#tuple":[]},{"#struct":{"first":"_"}},"_",{"#literal":true}]],["fn",{"#tuple":[]},{"#struct":{"second":"_"}},"_",["::core::cmp::eq",["::kernel::special_form::access","second","enabled"],{"#literal":true}]]]]',
    );
  });

  test("bound_query", () => {
    expect.hasAssertions();
    const result = Draft.withPrelude(graph).program({}, ($) => {
      const enabled = $.let(
        "enabled",
        $.query($.prelude().entities(1n)).filter("vertex", (_, vertex) =>
          $.isTrue(vertex.enabled),
        ),
      );
      expect(enabled).not.toHaveProperty("collect", expect.any(Function));
      return Program.Query.collect(enabled);
    });
    expect(text(result)).toBe(
      '["::kernel::special_form::let","enabled",["::graph::body::filter",["::graph::head::entities",{"#literal":1}],["fn",{"#tuple":[]},{"#struct":{"vertex":"_"}},"_",["::core::cmp::eq",["::kernel::special_form::access","vertex","enabled"],{"#literal":true}]]],["::graph::tail::collect","enabled"]]',
    );
  });

  test("entities", () => {
    expect.hasAssertions();
    const result = Draft.program({ axis: axes }, ($, { axis }) =>
      $.query
        .entities(axis)
        .filter("entity", () => true)
        .collect(),
    );
    expect(text(result)).toBe(
      '["::graph::tail::collect",["::graph::body::filter",["::graph::head::entities",["::kernel::special_form::input","axis","::graph::temporal::QueryTemporalAxes"]],["fn",{"#tuple":[]},{"#struct":{"entity":"_"}},"_",{"#literal":true}]]]',
    );
  });

  test("invalid_parameter_name", () => {
    expect.hasAssertions();
    let calls = 0;
    const result = Draft.withPrelude(graph).program({}, ($) =>
      $.query($.prelude().entities(1n))
        .filter("not a name", () => {
          calls += 1;
          return true;
        })
        .collect(),
    );
    expect(pipe(result, Result.flip, Result.getOrThrow).reason).toMatchObject({
      _tag: "InvalidParameterName",
      name: "not a name",
    });
    expect(calls).toBe(0);
  });
});

describe("namespace", () => {
  test("joined_constructor", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        types: { Both: Module.genericType<List>(1) },
        modules: { Both: child },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      const { Both } = $.prelude();
      expect(Both.name).toBe(child.values.name);
      expect(Both).toSatisfy(TypeExpression.isConstructor);
      expect(Both(Result.getOrThrow(Structural.type(BigInt)))).toSatisfy(
        TypeExpression.isExport,
      );
      return Both.name;
    });
    expect(result).toSatisfy(Result.isSuccess);
  });

  test("then_export", () => {
    expect.hasAssertions();
    const result = Draft.withPrelude({
      modules: { Both: child },
      values: { Both: Expression.integer(1) },
    }).program({}, ($) => {
      const { Both } = $.prelude();
      expect(Both.then).toBe(child.values.then);
      expect($.modules().Both.then).toBe(child.values.then);
      expect(Both.values.$).toBe(child.values.$);
      expect(Both.$).toBe(child.values.$);
      return Operators.eq(Both, 1n);
    });
    expect(result).toSatisfy(Result.isSuccess);
  });

  test("prototype_type", () => {
    expect.hasAssertions();
    const result = Draft.withPrelude(child).program({}, ($) => {
      // oxlint-disable-next-line eslint/no-proto -- __proto__ names a HashQL type export
      const type = $.prelude().__proto__;
      expect(type).toSatisfy(TypeExpression.isExport);
      return $.literal(true);
    });
    expect(result).toSatisfy(Result.isSuccess);
  });

  test("prototype_join", () => {
    expect.hasAssertions();
    const custom = Result.getOrThrow(
      Module.define("::custom", {
        modules: { ["__proto__"]: child },
        types: { ["__proto__"]: Module.type<Type.PrimitiveInteger>() },
        values: { ["__proto__"]: Module.value<Type.PrimitiveInteger>() },
      }),
    );
    const result = Draft.withPrelude(custom).program({}, ($) => {
      // oxlint-disable-next-line eslint/no-proto -- __proto__ names a HashQL export in all three namespaces
      const entry = $.prelude().__proto__;
      expect(entry).toSatisfy(TypeExpression.isExport);
      expect(entry).toSatisfy(Expression.isExpression);
      expect(entry).toSatisfy(Module.isModule);
      return entry;
    });
    expect(result).toSatisfy(Result.isSuccess);
  });
});

describe("exception", () => {
  test.each([new Error("user exception"), "non-error", undefined])(
    "host_exception_%#",
    (thrown) => {
      expect.hasAssertions();
      const result = Draft.program({}, () => {
        // oxlint-disable-next-line typescript/only-throw-error -- unchecked JavaScript callbacks can throw arbitrary values
        throw thrown;
      });
      const failure = pipe(result, Result.flip, Result.getOrThrow);
      assert(failure.reason._tag === "CallbackException");
      expect(failure.reason.cause).toBeInstanceOf(Cause.UnknownError);
      expect(failure.reason.cause.cause).toBe(thrown);
      expect(failure.message).toBe("A program callback threw an exception");
    },
  );

  test("branch_exception", () => {
    expect.hasAssertions();
    const thrown = new Error("branch callback");
    const fail = (): bigint => {
      throw thrown;
    };
    const results = [
      Draft.program({}, ($) => $.if(false, { then: fail, else: () => 1n })),
      Draft.program({}, ($) => $.if(true, { then: () => 1n, else: fail })),
      Draft.program({}, ($) => $.if(true, { then: fail })),
      Draft.withPrelude(graph).program({}, ($) =>
        $.query($.prelude().entities(1n))
          .filter("vertex", (): boolean => {
            throw thrown;
          })
          .collect(),
      ),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          reason: { _tag: "CallbackException", cause: { cause: thrown } },
        },
      });
    }
  });
});
