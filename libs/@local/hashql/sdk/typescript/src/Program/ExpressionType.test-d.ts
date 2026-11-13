import { pipe } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { ifElse } from "./Expression.js";

import type * as Type from "../Type.js";
import type { Expression } from "./Expression.js";
import type * as Inputs from "./Inputs.js";

declare const record: Expression<
  Type.Struct<{ readonly name: Type.PrimitiveString }>,
  Inputs.Empty
>;
declare const text: Expression<Type.PrimitiveString, Inputs.Empty>;

declare const dynamic: Expression<
  Type.Unknown,
  {
    readonly payload: Type.Unknown;
    readonly offset?: Type.PrimitiveInteger;
  }
>;
declare const offset: Expression<
  Type.PrimitiveInteger,
  {
    readonly offset: Type.PrimitiveInteger;
  }
>;
declare const enabled: Expression<
  Type.PrimitiveBoolean,
  {
    readonly enabled: Type.PrimitiveBoolean;
  }
>;
declare const fallback: Expression<
  Type.PrimitiveInteger,
  {
    readonly fallback?: Type.PrimitiveInteger;
  }
>;

declare const reserved: Expression<
  Type.Struct<{
    readonly pipe: Type.PrimitiveBoolean;
    readonly $projectUnsafe: Type.PrimitiveInteger;
    readonly $indexUnsafe: Type.PrimitiveString;
  }>,
  Inputs.Empty
>;

declare const inherited: Expression<
  Type.Struct<{
    readonly toString: Type.PrimitiveString;
    readonly call: Type.PrimitiveBoolean;
    readonly __proto__: Type.PrimitiveInteger;
    readonly name: Type.PrimitiveString;
  }>,
  Inputs.Empty
>;
declare const lookup: Expression<
  Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveString>,
  Inputs.Empty
>;
declare const generic: Expression<Type.GenericFunction.Any, Inputs.Empty>;

describe("unsafe_access", () => {
  test("operation_names", () => {
    expectTypeOf(reserved.$project("pipe")).toEqualTypeOf<
      Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(reserved.$project("$projectUnsafe")).toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf(reserved.$project("$indexUnsafe")).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(reserved.pipe((value) => value)).toEqualTypeOf<
      typeof reserved
    >();
  });

  test("projection_requirements", () => {
    expectTypeOf(dynamic.$projectUnsafe("name")).toEqualTypeOf<
      typeof dynamic
    >();
    expectTypeOf(dynamic.$projectUnsafe(10)).toEqualTypeOf<typeof dynamic>();
    expectTypeOf(record.$projectUnsafe("name")).toEqualTypeOf<
      Expression<Type.Unknown, Inputs.Empty>
    >();
    expectTypeOf(dynamic).not.toHaveProperty("$project");
    // @ts-expect-error A projection takes a field name or tuple position, not a symbol.
    dynamic.$projectUnsafe(Symbol("field"));
  });

  test("index_requirements", () => {
    expectTypeOf(dynamic.$indexUnsafe(offset)).toEqualTypeOf<
      Expression<
        Type.Unknown,
        {
          readonly payload: Type.Unknown;
          readonly offset: Type.PrimitiveInteger;
        }
      >
    >();
    expectTypeOf(dynamic.$indexUnsafe("key")).toEqualTypeOf<typeof dynamic>();
    expectTypeOf(dynamic).not.toHaveProperty("$index");
    // @ts-expect-error Unchecked access still requires an expression or host primitive.
    dynamic.$indexUnsafe({ key: "name" });
  });
});

describe("inherited_members", () => {
  test("field_names", () => {
    expectTypeOf(inherited).not.toHaveProperty("toString");
    expectTypeOf(inherited).not.toHaveProperty("call");
    expectTypeOf(inherited).not.toHaveProperty("__proto__");
    expectTypeOf(inherited.$project("toString")).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
    expectTypeOf(inherited.$project("call")).toEqualTypeOf<
      Expression<Type.PrimitiveBoolean, Inputs.Empty>
    >();
    expectTypeOf(inherited.$project("__proto__")).toEqualTypeOf<
      Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    expectTypeOf(inherited.name).toEqualTypeOf<
      Expression<Type.PrimitiveString, Inputs.Empty>
    >();
  });

  test("function_members", () => {
    expectTypeOf(lookup.name).toBeNever();
    expectTypeOf(lookup.length).toBeNever();
    expectTypeOf(lookup.prototype).toBeNever();
    expectTypeOf(lookup.toString()).toBeString();
    expectTypeOf(generic.name).toBeNever();
    expectTypeOf(generic.length).toBeNever();
    expectTypeOf(generic.prototype).toBeNever();
  });
});

describe("conditional", () => {
  test("requirements_and_forms", () => {
    const branches = { then: offset, else: fallback };
    type Expected = Expression<
      Type.PrimitiveInteger,
      {
        readonly enabled: Type.PrimitiveBoolean;
        readonly offset: Type.PrimitiveInteger;
        readonly fallback?: Type.PrimitiveInteger;
      }
    >;
    expectTypeOf(ifElse(enabled, branches)).toEqualTypeOf<Expected>();
    expectTypeOf(pipe(enabled, ifElse(branches))).toEqualTypeOf<Expected>();
    expectTypeOf(enabled.pipe(ifElse(branches))).toEqualTypeOf<Expected>();
  });

  test("branch_union", () => {
    expectTypeOf(
      pipe(true, ifElse({ then: text, else: offset })),
    ).toEqualTypeOf<
      Expression<
        Type.Union<readonly [Type.PrimitiveString, Type.PrimitiveInteger]>,
        { readonly offset: Type.PrimitiveInteger }
      >
    >();
  });

  test("condition_rejection", () => {
    // @ts-expect-error Conditions require Boolean semantics, not host truthiness.
    expectTypeOf(ifElse(1, { then: 1n, else: 0n })).toExtend<Expression.Any>();
    const choose = ifElse({ then: 1n, else: 0n });
    // @ts-expect-error The data-last form retains the Boolean condition constraint.
    expectTypeOf(text.pipe(choose)).toExtend<Expression.Any>();
    // @ts-expect-error Both branches must be expressions or host primitives.
    expectTypeOf(ifElse({ then: {}, else: 0n })).toBeFunction();
  });
});
