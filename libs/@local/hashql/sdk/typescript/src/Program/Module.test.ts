/**
 * Runtime checks for module binding, alias identity and invalid export names.
 *
 * @module
 */
import { Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as TypeSyntax from "../JExpr/Type/index.js";
import * as Expression from "./Expression.js";
import * as Module from "./Module.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

type Remainder = Type.Function<
  readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
  Type.PrimitiveInteger
>;
type Uuid = Type.Opaque<"::core::uuid::Uuid", Type.PrimitiveString>;

interface List extends Type.TypeConstructor {
  readonly arity: 1;
  readonly type: this["Target"] extends readonly [
    infer Element extends Type.Any,
  ]
    ? Type.List<Element>
    : Type.Never;
}

const kernelTypes = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: {
      Integer: Module.type<Type.PrimitiveInteger>(),
      List: Module.genericType<List>(1),
    },
  }),
);
const math = Result.getOrThrow(
  Module.define("::core::math", {
    values: { rem: Module.value<Remainder>() },
  }),
);
const uuid = Result.getOrThrow(
  Module.define("::core::uuid", {
    types: { Uuid: Module.type<Uuid>() },
    values: {
      Uuid: Module.value<
        Type.Function<readonly [Type.PrimitiveString], Uuid>
      >(),
    },
  }),
);
const modules = Result.getOrThrow(
  Module.root({
    kernel: Result.getOrThrow(
      Module.define("::kernel", { modules: { type: kernelTypes } }),
    ),
    core: Result.getOrThrow(
      Module.define("::core", { modules: { math, uuid } }),
    ),
  }),
);
const prelude = {
  remainder: modules.modules.core.modules.math.values.rem,
  Integer: modules.modules.kernel.modules.type.types.Integer,
  List: modules.modules.kernel.modules.type.types.List,
};
const integer = (
  value: number,
): Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =>
  Expression.fromJExpr(JExpr.integer(value));

const dividendValue = 7;
const divisorValue = 3;
const dividend = integer(dividendValue);
const divisor = integer(divisorValue);

const compile = (expression: Expression.Expression.Any): string =>
  JExpr.compile(Result.getOrThrow(Expression.toJExpr(expression)));

describe("module_exports", () => {
  test("prototype_named_export", () => {
    expect.hasAssertions();
    const name = "__proto__";
    const exports = Result.getOrThrow(
      Module.define("::exports", {
        types: { [name]: Module.type<Type.PrimitiveInteger>() },
      }),
    );
    expect(Object.hasOwn(exports.types, name)).toBe(true);
    expect(Object.getPrototypeOf(exports.types)).toBe(Object.prototype);
    expect(
      TypeSyntax.compile(Result.getOrThrow(exports.types[name].syntax)),
    ).toBe("::exports::__proto__");
  });

  test("nonenumerable_exports", () => {
    expect.hasAssertions();
    const types = { Integer: Module.type<Type.PrimitiveInteger>() };
    const children = { math };
    Object.defineProperty(types, "Integer", { enumerable: false });
    Object.defineProperty(children, "math", { enumerable: false });
    const exports = Result.getOrThrow(
      Module.define("::exports", { types, modules: children }),
    );
    const tree = Result.getOrThrow(Module.root(children));
    expect(Object.keys(exports.types)).toStrictEqual([]);
    expect(Object.hasOwn(exports.modules, "math")).toBe(false);
    expect(Object.hasOwn(tree.modules, "math")).toBe(false);
  });

  test("symbol_export", () => {
    expect.hasAssertions();
    const name = Symbol("not a HashQL name");
    const results = [
      Module.define("::exports", {
        types: { [name]: Module.type<Type.PrimitiveInteger>() },
      }),
      Module.define("::exports", {
        values: { [name]: Module.value<Type.PrimitiveInteger>() },
      }),
      Module.define("::exports", { modules: { [name]: math } }),
      Module.root({ [name]: math }),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { reason: { _tag: "SymbolExportName", name } },
      });
    }
  });

  test("optional_namespace", () => {
    expect.hasAssertions();
    const definition: {
      readonly types?: {
        readonly Integer: Module.Declaration<
          TypeExpression.TypeExpression<Type.PrimitiveInteger>
        >;
      };
    } = {};
    expect(
      Result.getOrThrow(Module.define("::exports", definition)).types,
    ).toStrictEqual({});
  });

  test("qualified_call", () => {
    expect.hasAssertions();
    expect(compile(prelude.remainder(dividend, divisor))).toBe(
      '["::core::math::rem",{"#literal":7},{"#literal":3}]',
    );
  });

  test("alias_identity", () => {
    expect.hasAssertions();
    const aliases = Result.getOrThrow(
      Module.define("::application", {
        modules: { arithmetic: math },
        types: { Whole: prelude.Integer, Sequence: prelude.List },
        values: { remainder: prelude.remainder },
      }),
    );
    expect(aliases.values.remainder).toBe(math.values.rem);
    expect(aliases.modules).toStrictEqual({ arithmetic: math });
    expect(aliases.types.Whole).toBe(kernelTypes.types.Integer);
    expect(aliases.types.Sequence).toBe(kernelTypes.types.List);
    expect(
      TypeSyntax.compile(
        Result.getOrThrow(
          TypeExpression.toType(aliases.types.Sequence(aliases.types.Whole)),
        ),
      ),
    ).toBe("::kernel::type::List<::kernel::type::Integer>");
  });

  test("type_and_constructor", () => {
    expect.hasAssertions();
    const text = Expression.fromJExpr<Type.PrimitiveString, Inputs.Empty>(
      JExpr.literal("6b118660-f68e-4f4f-a3ec-e79639ca16fd"),
    );
    expect(
      TypeSyntax.compile(
        Result.getOrThrow(TypeExpression.toType(uuid.types.Uuid)),
      ),
    ).toBe("::core::uuid::Uuid");
    expect(compile(uuid.values.Uuid(text))).toBe(
      '["::core::uuid::Uuid",{"#literal":"6b118660-f68e-4f4f-a3ec-e79639ca16fd"}]',
    );
  });

  test("nested_type_application", () => {
    expect.hasAssertions();
    const nested = prelude.List(prelude.List(prelude.Integer));
    expect(
      TypeSyntax.compile(Result.getOrThrow(TypeExpression.toType(nested))),
    ).toBe(
      "::kernel::type::List<::kernel::type::List<::kernel::type::Integer>>",
    );
    expect(compile(Expression.input("values", nested))).toBe(
      '["::kernel::special_form::input","values","::kernel::type::List<::kernel::type::List<::kernel::type::Integer>>"]',
    );
  });

  test("symbol_name", () => {
    expect.hasAssertions();
    const operators = Result.getOrThrow(
      Module.define("::core::math", {
        values: { "%": Module.value<Remainder>() },
      }),
    );
    expect(compile(operators.values["%"](dividend, divisor))).toBe(
      '["::core::math::`%`",{"#literal":7},{"#literal":3}]',
    );
  });
});

describe("module_relocation", () => {
  test("nested_exports", () => {
    expect.hasAssertions();
    const root = Result.getOrThrow(
      Module.define("::source", {
        modules: { arithmetic: math },
        types: { Integer: prelude.Integer, Sequence: prelude.List },
        values: { Uuid: uuid.values.Uuid },
      }),
    );
    const local = Result.getOrThrow(
      Module.relocate(
        root,
        Result.getOrThrow(JExpr.Path.decodeResult("local")),
      ),
    );
    expect(
      compile(local.modules.arithmetic.values.rem(dividend, divisor)),
    ).toBe('["local::arithmetic::rem",{"#literal":7},{"#literal":3}]');
    expect(
      TypeSyntax.compile(
        Result.getOrThrow(local.types.Sequence(prelude.Integer).syntax),
      ),
    ).toBe("local::Sequence<::kernel::type::Integer>");
    expect(
      TypeSyntax.compile(Result.getOrThrow(local.types.Integer.syntax)),
    ).toBe("local::Integer");
    expect(compile(local.values.Uuid("id"))).toBe(
      '["local::Uuid",{"#literal":"id"}]',
    );
  });

  test("repeated_relocation", () => {
    expect.hasAssertions();
    const root = Result.getOrThrow(
      Module.define("::source", { modules: { arithmetic: math } }),
    );
    const local = Result.getOrThrow(
      Module.relocate(
        root,
        Result.getOrThrow(JExpr.Path.decodeResult("local")),
      ),
    );
    const second = Result.getOrThrow(
      pipe(
        local,
        Module.relocate(Result.getOrThrow(JExpr.Path.decodeResult("second"))),
      ),
    );
    expect(
      compile(second.modules.arithmetic.values.rem(dividend, divisor)),
    ).toBe('["second::arithmetic::rem",{"#literal":7},{"#literal":3}]');
    expect(compile(math.values.rem(dividend, divisor))).toBe(
      '["::core::math::rem",{"#literal":7},{"#literal":3}]',
    );
  });

  test("value_failure", () => {
    expect.hasAssertions();
    const invalid = Expression.number(Infinity);
    const source = Result.getOrThrow(
      Module.define("::source", { values: { invalid } }),
    );
    const result = Module.relocate(
      source,
      Result.getOrThrow(JExpr.Path.decodeResult("local")),
    );
    expect(
      Result.match(result, {
        onFailure: (error) => error.reason._tag,
        onSuccess: () => null,
      }),
    ).toBe("InvalidExpression");
  });
});

describe("module_construction", () => {
  test("record_snapshot", () => {
    expect.hasAssertions();
    const definitions = { rem: math.values.rem };
    const children = { arithmetic: math };
    const snapshot = Result.getOrThrow(
      Module.define("::application", {
        values: definitions,
        modules: children,
      }),
    );
    definitions.rem = Expression.fromJExpr<Remainder, Inputs.Empty>(
      "replacement",
    );
    children.arithmetic = Result.getOrThrow(
      Module.define("::other", {
        values: { rem: Module.value<Remainder>() },
      }),
    );
    expect(snapshot.values.rem).toBe(math.values.rem);
    expect(snapshot.modules.arithmetic).toBe(math);
    expect(
      [
        snapshot,
        snapshot.values,
        snapshot.types,
        snapshot.modules,
        modules.modules,
      ].every(Object.isFrozen),
    ).toBe(true);
    expect(Reflect.set(snapshot.values, "other", math.values.rem)).toBe(false);
  });

  test("prototype_names", () => {
    expect.hasAssertions();
    const unusual = Result.getOrThrow(
      Module.define("::example", {
        values: {
          ["__proto__"]: Module.value<Type.PrimitiveInteger>(),
          constructor: Module.value<Type.PrimitiveInteger>(),
        },
      }),
    );
    const { __proto__: prototypeExport } = unusual.values;
    expect(Object.hasOwn(unusual.values, "__proto__")).toBe(true);
    expect(compile(prototypeExport)).toBe('"::example::__proto__"');
    expect(compile(unusual.values.constructor)).toBe(
      '"::example::constructor"',
    );
  });

  test("invalid_names", () => {
    expect.hasAssertions();
    expect(Module.define("core::math", {})).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "ProgramError/Construction",
        reason: { _tag: "RelativeModulePath", path: "core::math" },
      },
    });
    expect(Module.define("", {})).toMatchObject({
      _tag: "Failure",
      failure: { reason: { _tag: "InvalidModulePath", path: "" } },
    });
    for (const result of [
      Module.define("::core::math", {
        values: { "": Module.value<Remainder>() },
      }),
      Module.define("::core", { modules: { "": math } }),
      Module.root({ "": math }),
      Module.define("::core::math", { values: { "": math.values.rem } }),
    ]) {
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: { reason: { _tag: "InvalidExportName", name: "" } },
      });
    }
  });

  test.each([-1, Number.NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "invalid_type_arity: %s",
    (arity) => {
      expect.hasAssertions();
      const result = Module.define("::generic", {
        types: { Invalid: Module.genericType<Type.TypeConstructor>(arity) },
      });
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          _tag: "ProgramError/Construction",
          reason: { _tag: "InvalidTypeArity", arity },
        },
      });
    },
  );
});

describe("type_application", () => {
  test("runtime_type_arity", () => {
    expect.hasAssertions();
    // @ts-expect-error The runtime call omits the required type argument.
    const missing = prelude.List();
    // @ts-expect-error The runtime call supplies an extra type argument.
    const extra = prelude.List(prelude.Integer, prelude.Integer);
    expect(TypeExpression.toType(missing)).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "TypeArgumentCountMismatch", expected: 1, received: 0 },
      },
    });
    expect(TypeExpression.toType(extra)).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "TypeArgumentCountMismatch", expected: 1, received: 2 },
      },
    });
    expect(TypeExpression.toType(prelude.List(missing))).toStrictEqual(
      TypeExpression.toType(missing),
    );
    expect(Expression.toJExpr(Expression.input("values", extra))).toStrictEqual(
      TypeExpression.toType(extra),
    );
  });
});
