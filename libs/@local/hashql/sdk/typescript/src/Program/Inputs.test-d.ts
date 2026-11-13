import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Expression from "./Expression.js";
import * as Program from "./index.js";
import * as Operators from "./Operators.js";
import * as Structural from "./Structural.js";
import * as TypeExpression from "./TypeExpression.js";

import type * as Type from "../Type.js";
import type * as Inputs from "./Inputs.js";

const integer = Result.getOrThrow(Structural.type(BigInt));
const boolean = Result.getOrThrow(Structural.type(Boolean));
const string = Result.getOrThrow(Structural.type(String));

type UserId = Type.Opaque<"example::UserId", Type.PrimitiveInteger>;

interface Same extends Type.FunctionSignature {
  readonly type: this["Target"] extends readonly [infer T extends Type.Any]
    ? Type.Function<readonly [T], T>
    : Type.Function<readonly [Type.Never], Type.Never>;
}

declare const optionalDefault:
  | Expression.Expression<
      Type.PrimitiveInteger,
      { readonly fallback: Type.PrimitiveInteger }
    >
  | undefined;

declare const hostAlternative:
  | Expression.Expression<
      Type.PrimitiveInteger,
      { readonly first: Type.PrimitiveInteger }
    >
  | Expression.Expression<
      Type.PrimitiveInteger,
      { readonly second: Type.PrimitiveInteger }
    >;
declare const possiblyClosed:
  | Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
  | Expression.Expression<
      Type.PrimitiveInteger,
      { readonly first: Type.PrimitiveInteger }
    >;

describe("requirement_algebra", () => {
  test("optional_tuple", () => {
    expectTypeOf<
      Inputs.All<
        readonly [
          first?: { readonly count?: Type.PrimitiveInteger },
          second?: {
            readonly count: Type.PrimitiveInteger;
            readonly label: Type.PrimitiveString;
          },
        ]
      >
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly label: Type.PrimitiveString;
    }>();
  });

  test("empty_and_variadic_tuple", () => {
    // oxlint-disable-next-line typescript/no-generated-empty-object-type -- an empty tuple contributes no input names
    expectTypeOf<Inputs.All<readonly []>>().toEqualTypeOf<Inputs.Empty>();
    expectTypeOf<
      Inputs.All<
        readonly [
          { readonly first: Type.PrimitiveInteger },
          ...{ readonly second: Type.PrimitiveString }[],
        ]
      >
    >().toEqualTypeOf<{
      readonly first: Type.PrimitiveInteger;
      readonly second: Type.PrimitiveString;
    }>();
  });

  test("optional_shared_subset", () => {
    expectTypeOf<
      Inputs.Conservative<
        | { readonly count: Type.PrimitiveInteger }
        | {
            readonly count: Type.PrimitiveInteger;
            readonly enabled?: Type.PrimitiveBoolean;
          }
      >
    >().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled?: Type.PrimitiveBoolean;
    }>();
  });

  test("optional_only", () => {
    expectTypeOf<
      Inputs.Conservative<
        Inputs.Empty | { readonly enabled?: Type.PrimitiveBoolean }
      >
    >().toEqualTypeOf<{ readonly enabled?: Type.PrimitiveBoolean }>();
  });

  test("required_conflict", () => {
    expectTypeOf<
      Inputs.Conservative<
        | { readonly value?: Type.PrimitiveInteger }
        | { readonly value: Type.PrimitiveString }
      >
    >().toEqualTypeOf<{ readonly value: Type.Never }>();
    expectTypeOf<
      Inputs.Merge<{ readonly value?: Type.PrimitiveInteger }, Inputs.Empty>
    >().toEqualTypeOf<{ readonly value?: Type.PrimitiveInteger }>();
  });

  test("erased_metadata", () => {
    expectTypeOf<Inputs.Conservative<never>>().toEqualTypeOf<Inputs.Erased>();
    // oxlint-disable-next-line typescript/no-restricted-types -- exercises erasure of the requirement record
    expectTypeOf<Inputs.Conservative<unknown>>().toEqualTypeOf<Inputs.Erased>();
    expectTypeOf<
      Inputs.Merge<Inputs.Erased, { readonly count: Type.PrimitiveInteger }>
    >().toEqualTypeOf<never>();
  });
});

describe("merge", () => {
  test("primitive_conflict", () => {
    expectTypeOf<
      Inputs.Merge<
        { readonly id: Type.PrimitiveInteger },
        { readonly id: Type.PrimitiveString }
      >
    >().toEqualTypeOf<{ readonly id: Type.Never }>();
  });

  test("kind_conflict", () => {
    expectTypeOf<
      Inputs.Merge<
        { readonly id: UserId },
        { readonly id: Type.PrimitiveInteger }
      >
    >().toEqualTypeOf<{
      readonly id: Type.Intersection<readonly [UserId, Type.PrimitiveInteger]>;
    }>();
  });
});

describe("input_requirements", () => {
  test("host_alternatives", () => {
    type Alternatives =
      | { readonly first: Type.PrimitiveInteger }
      | { readonly second: Type.PrimitiveString };
    expectTypeOf<
      Inputs.Merge<Alternatives, { readonly third: Type.PrimitiveBoolean }>
    >().toEqualTypeOf<{
      readonly first: Type.PrimitiveInteger;
      readonly second: Type.PrimitiveString;
      readonly third: Type.PrimitiveBoolean;
    }>();
    expectTypeOf<
      Inputs.Conservative<
        Inputs.Empty | { readonly first: Type.PrimitiveInteger }
      >
    >().toEqualTypeOf<{ readonly first: Type.PrimitiveInteger }>();
    expectTypeOf<
      Inputs.Conservative<
        | { readonly same: Type.PrimitiveInteger }
        | { readonly same: Type.PrimitiveString }
      >
    >().toEqualTypeOf<{ readonly same: Type.Never }>();
    const composed = Expression.ifElse(true, {
      // oxlint-disable-next-line unicorn/no-thenable -- this property holds a query branch
      then: hostAlternative,
      else: 0n,
    });
    // @ts-expect-error an empty annotation cannot hide host-side alternatives
    const closed: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      composed;
    expectTypeOf(closed).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    const combined = Expression.ifElse(true, {
      // oxlint-disable-next-line unicorn/no-thenable -- this property holds a query branch
      then: possiblyClosed,
      else: 0n,
    });
    // @ts-expect-error a closed alternative cannot make a required alternative disappear through contravariance
    const hidden: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      combined;
    expectTypeOf(hidden).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
  });

  test("required_and_default", () => {
    const required = Expression.input("count", integer);
    const optional = Expression.input("limit", integer, Expression.integer(10));
    expectTypeOf<Expression.Inputs<typeof required>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    expectTypeOf<Expression.Inputs<typeof optional>>().toEqualTypeOf<{
      readonly limit?: Type.PrimitiveInteger;
    }>();
    // @ts-expect-error A closed-expression annotation cannot discard a required input.
    const closed: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      required;
    expectTypeOf(closed).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
    // @ts-expect-error The default must have the input's declared semantic type.
    Expression.input("count", integer, Expression.literal(false));
  });

  test("uncertain_default", () => {
    const value = Expression.input("count", integer, optionalDefault);
    // oxlint-disable-next-line unicorn/no-useless-undefined -- checks an explicitly absent host default
    const omitted = Expression.input("count", integer, undefined);
    expectTypeOf<Expression.Inputs<typeof value>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly fallback: Type.PrimitiveInteger;
    }>();
    expectTypeOf<Expression.Inputs<typeof omitted>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
  });

  test("default_dependencies", () => {
    const fallback = Expression.input("fallback", integer);
    const value = Expression.input("count", integer, fallback);
    expectTypeOf<Expression.Inputs<typeof value>>().toEqualTypeOf<{
      readonly count?: Type.PrimitiveInteger;
      readonly fallback: Type.PrimitiveInteger;
    }>();
  });

  test("repeated_name", () => {
    const optional = Expression.input(
      "enabled",
      boolean,
      Expression.literal(true),
    );
    const required = Expression.input("enabled", boolean);
    const both = Operators.and(optional, required);
    expectTypeOf<Expression.Inputs<typeof both>>().toEqualTypeOf<{
      readonly enabled: Type.PrimitiveBoolean;
    }>();
    const defaults = Operators.or(optional, optional);
    expectTypeOf<Expression.Inputs<typeof defaults>>().toEqualTypeOf<{
      readonly enabled?: Type.PrimitiveBoolean;
    }>();
  });

  test("conflicting_name", () => {
    const count = Expression.input("shared", integer);
    const text = Expression.input("shared", string);
    const value = Expression.ifElse(Expression.literal(true), {
      // oxlint-disable-next-line unicorn/no-thenable -- this property holds a query branch
      then: count,
      else: text,
    });
    expectTypeOf<Expression.Inputs<typeof value>>().toEqualTypeOf<{
      readonly shared: Type.Never;
    }>();
  });
});

describe("operation_requirements", () => {
  test("primitive_composition", () => {
    const left = Expression.input("left", integer);
    const right = Expression.input("right", integer);
    const enabled = Expression.input("enabled", boolean);
    const predicate = Operators.or(
      Operators.and(Operators.eq(left, right), Operators.isTrue(enabled)),
      Operators.isFalse(enabled),
    );
    expectTypeOf<Expression.Inputs<typeof predicate>>().toEqualTypeOf<{
      readonly left: Type.PrimitiveInteger;
      readonly right: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
  });

  test("projection_and_index", () => {
    const rowsType = TypeExpression.reference<
      Type.Struct<{ readonly values: Type.List<Type.PrimitiveString> }>
    >(Result.getOrThrow(JExpr.Path.decodeResult("::example::Rows")));
    const rows = Expression.input("rows", rowsType);
    const position = Expression.input("position", integer);
    const projected = rows.$project("values");
    const selected = rows.values.$index(position);
    expectTypeOf<Expression.Inputs<typeof projected>>().toEqualTypeOf<
      Expression.Inputs<typeof rows>
    >();
    expectTypeOf<Expression.Inputs<typeof selected>>().toEqualTypeOf<{
      readonly rows: Type.Struct<{
        readonly values: Type.List<Type.PrimitiveString>;
      }>;
      readonly position: Type.PrimitiveInteger;
    }>();
  });

  test("function_and_generic_calls", () => {
    const count = Expression.input("count", integer);
    const callee = Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveInteger], Type.PrimitiveInteger>,
      { readonly receiver: Type.PrimitiveBoolean }
    >("callee");
    const result = callee(count);
    expectTypeOf<Expression.Inputs<typeof result>>().toEqualTypeOf<{
      readonly receiver: Type.PrimitiveBoolean;
      readonly count: Type.PrimitiveInteger;
    }>();
    const generic = Expression.fromJExpr<
      Type.GenericFunction<Same>,
      Inputs.Empty
    >("same");
    const identity = generic(count);
    expectTypeOf<Expression.Inputs<typeof identity>>().toEqualTypeOf<
      Expression.Inputs<typeof count>
    >();
    // @ts-expect-error Input accumulation must not widen the call's parameter types.
    callee(Expression.input("wrong", boolean));
    // @ts-expect-error A fixed signature still checks arity.
    callee(count, count);
  });
});

describe("snippet_requirements", () => {
  test("reusable_snippet", () => {
    const count = Expression.input("count", integer);
    const snippet = Operators.ne(count, Expression.integer(0));
    const combined = Operators.and(
      snippet,
      Expression.input("enabled", boolean),
    );
    const program = Program.program(combined);
    expectTypeOf<Expression.Inputs<typeof snippet>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    expectTypeOf<Program.Inputs<typeof program>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
  });
});

describe("builder_requirements", () => {
  test("assumption_preservation", () => {
    const source = Expression.input("source", integer);
    const assumed = Expression.assume<Type.PrimitiveString>()(source);
    expectTypeOf<Expression.Inputs<typeof assumed>>().toEqualTypeOf<
      Expression.Inputs<typeof source>
    >();
  });
});
