import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import { Do as EmptyDo, Let, withPrelude } from "../do/index.js";
import { Expression, Module, Program } from "../main.js";

import type { Inputs, Type } from "../main.js";

const kernel = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: {
      Integer: Module.type<Type.PrimitiveInteger>(),
      Boolean: Module.type<Type.PrimitiveBoolean>(),
      String: Module.type<Type.PrimitiveString>(),
    },
  }),
);
const integer = kernel.types.Integer;
const boolean = kernel.types.Boolean;
const string = kernel.types.String;

type Vertex = Type.Struct<{ readonly enabled: Type.PrimitiveBoolean }>;
type Graph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Vertex }>
>;

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

describe("input_requirements", () => {
  test("host_alternatives_keep_every_requirement", () => {
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
    const alternative =
      Math.random() > 0.5
        ? Expression.input("first", integer)
        : Expression.input("second", integer);
    const composed = Expression.ifElse(true, { then: alternative, else: 0n });
    // @ts-expect-error an empty annotation cannot hide host-side alternatives
    const closed: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      composed;
    expectTypeOf(closed);
    const choose = ():
      | Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
      | Expression.Expression<
          Type.PrimitiveInteger,
          { readonly first: Type.PrimitiveInteger }
        > =>
      Math.random() > 0.5
        ? Expression.input("first", integer)
        : Expression.integer(0);
    const possiblyClosed = choose();
    const combined = Expression.ifElse(true, {
      then: possiblyClosed,
      else: 0n,
    });
    // @ts-expect-error a closed alternative cannot make a required alternative disappear through contravariance
    const hidden: Expression.Expression<Type.PrimitiveInteger, Inputs.Empty> =
      combined;
    expectTypeOf(hidden);
    // Do's contextual callback requires a common record for this ambiguous host union.
    const block = EmptyDo<
      Type.PrimitiveInteger,
      { readonly first: Type.PrimitiveInteger }
    >(() => choose());
    // @ts-expect-error a block also keeps the required alternative
    const hiddenBlock: Expression.Expression<
      Type.PrimitiveInteger,
      Inputs.Empty
    > = Result.getOrThrow(block);
    expectTypeOf(hiddenBlock);
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
    expectTypeOf(closed);
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
    const both = optional.$.and(required);
    expectTypeOf<Expression.Inputs<typeof both>>().toEqualTypeOf<{
      readonly enabled: Type.PrimitiveBoolean;
    }>();
    const defaults = optional.$.or(optional);
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
    const predicate = left.$.eq(right)
      .$.and(enabled.$.isTrue())
      .$.or(enabled.$.isFalse());
    expectTypeOf<Expression.Inputs<typeof predicate>>().toEqualTypeOf<{
      readonly left: Type.PrimitiveInteger;
      readonly right: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
  });

  test("projection_and_index", () => {
    const module = Result.getOrThrow(
      Module.define("::example", {
        types: {
          Rows: Module.type<
            Type.Struct<{ readonly values: Type.List<Type.PrimitiveString> }>
          >(),
        },
      }),
    );
    const rows = Expression.input("rows", module.types.Rows);
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
    const snippet = count.$.ne(Expression.integer(0));
    const first = Result.getOrThrow(EmptyDo(() => snippet));
    const second = Result.getOrThrow(
      EmptyDo(($) => snippet.$.and($.input("enabled", boolean))),
    );
    const program = Program.program(second);
    expectTypeOf<Expression.Inputs<typeof first>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
    }>();
    expectTypeOf<Program.Inputs<typeof program>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
  });

  test("discarded_expression", () => {
    const expression = Result.getOrThrow(
      EmptyDo(($) => {
        $.input("unused", integer);
        return $.integer(1);
      }),
    );
    expectTypeOf(expression).toEqualTypeOf<
      Expression.Expression<Type.PrimitiveInteger, Inputs.Empty>
    >();
  });

  test("unused_and_shadowed_declarations", () => {
    const expression = Result.getOrThrow(
      EmptyDo(
        Let("value", ($) => $.input("first", integer)),
        Let("value", ($) => $.input("second", integer)),
        ($) => $.integer(1),
      ),
    );
    expectTypeOf<Expression.Inputs<typeof expression>>().toEqualTypeOf<{
      readonly first: Type.PrimitiveInteger;
      readonly second: Type.PrimitiveInteger;
    }>();
  });

  test("nested_branches", () => {
    const expression = Result.getOrThrow(
      EmptyDo(($) =>
        $.if(
          $.input("condition", boolean),
          () =>
            $.Let("ignored", ($) => $.input("left", integer)).Expr(($) =>
              $.integer(1),
            ),
          () => $.input("right", integer),
        ),
      ),
    );
    expectTypeOf<Expression.Inputs<typeof expression>>().toEqualTypeOf<{
      readonly condition: Type.PrimitiveBoolean;
      readonly left: Type.PrimitiveInteger;
      readonly right: Type.PrimitiveInteger;
    }>();
  });
});

describe("builder_requirements", () => {
  test("query_dependencies", () => {
    const { Do } = withPrelude({
      values: {
        entities: Expression.fromJExpr<
          Type.Function<readonly [Type.PrimitiveInteger], Graph>,
          Inputs.Empty
        >("entities"),
      },
    });
    const expression = Result.getOrThrow(
      Do(($) =>
        $.query
          .entities($.input("at", integer))
          .filter("vertex", (vertex) =>
            vertex.enabled.$.eq($.input("enabled", boolean)),
          )
          .collect(),
      ),
    );
    expectTypeOf<Expression.Inputs<typeof expression>>().toEqualTypeOf<{
      readonly at: Type.PrimitiveInteger;
      readonly enabled: Type.PrimitiveBoolean;
    }>();
  });

  test("declaration_preservation", () => {
    const { Do, Type: Alias, Import } = withPrelude({ modules: { kernel } });
    const expression = Result.getOrThrow(
      Do(
        Import((_, { kernel }) => kernel),
        Let("first", ($, _, { Integer: integerType }) =>
          $.input("first", integerType),
        ),
        Alias("Count", (_, { Integer: integerType }) => integerType),
        Let("second", ($, _, { Count: countType }) =>
          $.input("second", countType),
        ),
        Let("third", ($) => $.input("third", integer)),
        Let("fourth", ($) => $.input("fourth", integer)),
        Let("fifth", ($) => $.input("fifth", integer)),
        Let("sixth", ($) => $.input("sixth", integer)),
        ($) => $.integer(1),
      ),
    );
    expectTypeOf<keyof Expression.Inputs<typeof expression>>().toEqualTypeOf<
      "first" | "second" | "third" | "fourth" | "fifth" | "sixth"
    >();
    const nested = Result.getOrThrow(
      Do(($) =>
        $.Let("value", ($) => $.input("kept", integer))
          .Import((_, { kernel }) => kernel)
          .Type("Count", (_, { Integer: integerType }) => integerType)
          .Expr(($) => $.integer(1)),
      ),
    );
    expectTypeOf<Expression.Inputs<typeof nested>>().toEqualTypeOf<{
      readonly kept: Type.PrimitiveInteger;
    }>();
  });

  test("assumption_preservation", () => {
    const source = Expression.input("source", integer);
    const assumed = Expression.assume<Type.PrimitiveString>()(source);
    expectTypeOf<Expression.Inputs<typeof assumed>>().toEqualTypeOf<
      Expression.Inputs<typeof source>
    >();
  });
});
