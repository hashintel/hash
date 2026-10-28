/**
 * Type checks for the explicit-input boundary of Draft programs, and for nominal identity, imports and requirement composition inside them.
 *
 * @module
 */
import { Function, Option, Result } from "effect";
// oxlint-disable unicorn/no-thenable -- then names a HashQL branch or a declared export
import { describe, expectTypeOf, test } from "vitest";

import * as JExpr from "../JExpr/index.js";
import * as Program from "../Program/index.js";
import * as Draft from "./index.js";

import type * as Type from "../Type.js";
import type * as Context from "./Context.js";

const {
  Expression,
  Module,
  Namespace,
  Operators,
  Prelude,
  Structural,
  TypeExpression,
} = Program;

const integer = Result.getOrThrow(Structural.type(BigInt));
const string = Result.getOrThrow(Structural.type(String));
const outside = Expression.input("outside", integer);

/** A struct with one integer field, `foo`. */
type Box = Type.Struct<{ readonly foo: Type.PrimitiveInteger }>;

// oxlint-disable-next-line typescript/promise-function-async -- this fixture supplies a Promise where the synchronous API rejects one
const asynchronousBody = (): Promise<
  Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
> => Promise.resolve(Expression.literal(true));

/** Returns `left` as either argument's type, so the result's type is a union of two handles. */
const alternative = <A, B>(left: A, _right: B): A | B => left;

/** A record whose `foo` is one of two handles, one needing no input and one needing `outside`. */
const chooseBox = ():
  | {
      readonly foo: Program.Expression.Expression<
        Type.PrimitiveInteger,
        Program.Inputs.Empty
      >;
    }
  | { readonly foo: typeof outside } => ({ foo: outside });

/** A one-element tuple holding one of the same two handles. */
const chooseTuple = ():
  | readonly [
      Program.Expression.Expression<
        Type.PrimitiveInteger,
        Program.Inputs.Empty
      >,
    ]
  | readonly [typeof outside] => [outside];

/** A schema that is either empty or declares `outside`. */
const chooseSchema = ():
  | Program.Inputs.Empty
  | { readonly outside: typeof integer } => ({ outside: integer });

/** A callback over the unrestricted context, whose discarded declarations read an input no schema declares. */
const unrestricted = (
  $: Context.Context<Program.Scope.Scope.Empty>,
): Program.Expression.Expression<
  Type.PrimitiveBoolean,
  Program.Inputs.Empty
> => {
  expectTypeOf($.let("outside", outside)).toEqualTypeOf<
    Program.Expression.Expression<
      Type.PrimitiveInteger,
      { readonly outside: Type.PrimitiveInteger }
    >
  >();
  // The annotation's type replaces the value's, and the value keeps its inputs.
  expectTypeOf($.let("widened", outside, Number)).toEqualTypeOf<
    Program.Expression.Expression<
      Type.PrimitiveNumber,
      { readonly outside: Type.PrimitiveInteger }
    >
  >();
  return $.literal(true);
};

/** A prelude whose `types` record is optional. */
const optionalPrelude = (): {
  readonly types?: { readonly Integer: typeof integer };
} => ({ types: { Integer: integer } });

const requirements = Result.getOrThrow(
  Module.define("::requirements", {
    values: { outside },
    types: { Integer: integer },
  }),
);

describe("program", () => {
  test("conservative_inputs", () => {
    const result = Draft.program(
      { count: integer, label: string },
      ($, inputs) => {
        expectTypeOf(inputs.count).toEqualTypeOf<
          Program.Expression.Expression<
            Type.PrimitiveInteger,
            { readonly count: Type.PrimitiveInteger }
          >
        >();
        $.let("discarded", inputs.count);
        return $.literal(true);
      },
    );
    expectTypeOf(Result.getOrThrow(result)).toEqualTypeOf<
      Program.Expression.Expression<
        Type.PrimitiveBoolean,
        {
          readonly count: Type.PrimitiveInteger;
          readonly label: Type.PrimitiveString;
        }
      >
    >();
    expectTypeOf(
      Result.getOrThrow(Draft.program({}, ($) => $.literal(true))),
    ).toEqualTypeOf<
      Program.Expression.Expression<Type.PrimitiveBoolean, Program.Inputs.Empty>
    >();
  });

  test("schema_shorthand", () => {
    const result = Draft.program(
      {
        flag: Boolean,
        count: BigInt,
        point: { width: Number, height: Number },
      },
      ($, inputs) => {
        expectTypeOf(inputs.flag).toEqualTypeOf<
          Program.Expression.Expression<
            Type.PrimitiveBoolean,
            { readonly flag: Type.PrimitiveBoolean }
          >
        >();
        expectTypeOf(inputs.point.width).toEqualTypeOf<
          Program.Expression.Expression<
            Type.PrimitiveNumber,
            {
              readonly point: Type.Struct<{
                readonly width: Type.PrimitiveNumber;
                readonly height: Type.PrimitiveNumber;
              }>;
            }
          >
        >();
        return $.if(inputs.flag, {
          then: () => inputs.count,
          else: () => 0n,
        });
      },
    );
    expectTypeOf<
      Program.Expression.Value.Inputs<Result.Result.Success<typeof result>>
    >().toEqualTypeOf<{
      readonly flag: Type.PrimitiveBoolean;
      readonly count: Type.PrimitiveInteger;
      readonly point: Type.Struct<{
        readonly width: Type.PrimitiveNumber;
        readonly height: Type.PrimitiveNumber;
      }>;
    }>();
    // @ts-expect-error a shorthand entry declares the same input as its type expression, so a mismatched use fails
    Draft.program({ outside: String }, () => outside);
    Draft.program({ outside: BigInt }, () => outside);
  });

  test("schema_checks", () => {
    const optional = Expression.input("optional", integer, 1n);
    // @ts-expect-error undeclared final input
    Draft.program({}, () => outside);
    Draft.program({}, ($) => {
      // @ts-expect-error discarded initializer still requires an input
      $.let("lost", outside);
      // @ts-expect-error the schema must include optional external inputs
      $.let("optional", optional);
      $.if(true, {
        // @ts-expect-error child final expression contains an undeclared input
        then: () => outside,
        else: () => 1n,
      });
      $.if(true, {
        then: () => 1n,
        // @ts-expect-error the else branch contains an undeclared input
        else: () => outside,
      });
      // @ts-expect-error a then-only branch contains an undeclared input
      $.if(true, { then: () => outside });
      // @ts-expect-error branches are callbacks rather than values
      $.if(true, { then: 1n, else: 2n });
      return $.literal(true);
    });
    Draft.program({ outside: integer }, ($) => $.let("allowed", outside));
    const selected = alternative(outside, Expression.input("other", integer));
    const composed = Expression.ifElse(true, { then: selected, else: 1n });
    expectTypeOf(composed);
    // @ts-expect-error composition cannot erase alternative undeclared inputs
    Draft.program({}, ($) => $.let("lostAlternative", composed));
    // @ts-expect-error same input name with incompatible type
    Draft.program({ outside: string }, () => outside);
    // @ts-expect-error async callbacks do not construct programs
    Draft.program({}, asynchronousBody);
    const key = Symbol("input");
    // @ts-expect-error a symbol key cannot name an input
    Draft.program({ [key]: integer }, ($) => $.literal(true));
    // @ts-expect-error a symbol key cannot name a prelude export
    Draft.withPrelude({ values: { [key]: Expression.integer(1) } });
  });

  test("nominal_identity", () => {
    Draft.program({ count: integer }, ($, inputs) => {
      const Foo = $.newtype("Foo", { foo: BigInt });
      const Other = $.newtype("Other", { foo: BigInt });
      const wide = Function.identity<string>("Wide");
      // @ts-expect-error a widened name cannot supply a distinct nominal identity
      $.newtype(wide, BigInt);
      // @ts-expect-error semantic descriptors are not runtime type definitions
      $.type("Phantom", { _tag: "Integer" });
      const value = Foo({ foo: inputs.count });
      expectTypeOf<Program.Expression.Value.Type<typeof value>>().toEqualTypeOf<
        Type.Opaque<"Foo", Type.Struct<{ readonly foo: Type.PrimitiveInteger }>>
      >();
      expectTypeOf<
        Program.Expression.Value.Inputs<typeof value>
      >().toEqualTypeOf<{
        readonly count: Type.PrimitiveInteger;
      }>();
      expectTypeOf(Foo({ foo: 2n })).toExtend<
        Program.Expression.Expression<
          Type.Opaque<
            "Foo",
            Type.Struct<{ readonly foo: Type.PrimitiveInteger }>
          >,
          Program.Inputs.Empty
        >
      >();
      // @ts-expect-error primitive host number is not Integer
      Foo({ foo: 2 });
      // @ts-expect-error missing structural field
      Foo({});
      // @ts-expect-error extra structural field is not an exact ascription
      Foo({ foo: 2n, extra: true });
      // @ts-expect-error distinct names retain nominal identity
      const mismatch: typeof value = Other({ foo: inputs.count });
      expectTypeOf(mismatch);
      // @ts-expect-error cannot substitute a plain underlying record for nominal value
      const underlying: typeof value = $.literal(2n);
      expectTypeOf(underlying);
      return value;
    });
  });

  test("metadata_types", () => {
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
    Draft.withPrelude(custom).program({}, ($) => {
      const { Shared } = $.prelude();
      // @ts-expect-error metadata is a Result, not also an expression handle
      const impossible: Program.Expression.Expression.Any = Shared.syntax;
      expectTypeOf(impossible);
      return Shared.$project("syntax");
    });
  });

  test("prelude_capabilities", () => {
    Draft.program({}, ($) => {
      const { Uuid, EntityUuid, eq, add, List, Integer } = $.prelude();
      const comparison = $.let("comparison", EntityUuid(Uuid("uuid")));
      const list = List(Integer);
      expectTypeOf(list).toEqualTypeOf<
        Program.TypeExpression.TypeExpression<Type.List<Type.PrimitiveInteger>>
      >();
      // @ts-expect-error arithmetic excludes strings
      add("one", "two");
      // @ts-expect-error List has one type argument
      List(Integer, Integer);
      // @ts-expect-error module keys remain precise
      expectTypeOf($.modules().uuid.UnknownExport);
      // @ts-expect-error nominal constructor requires a Uuid
      EntityUuid("uuid");
      return eq(comparison, comparison);
    });
    Draft.withPrelude({}).program({}, ($) => {
      // @ts-expect-error custom prelude replaces builtins
      expectTypeOf($.prelude().Uuid);
      return $.literal(true);
    });
  });
});

describe("construction", () => {
  test("policy_separation", () => {
    // @ts-expect-error an unrestricted helper can hide inputs in discarded declarations
    Draft.withPrelude({}).program({}, unrestricted);
    expectTypeOf(unrestricted);
  });

  test("restricted_helper", () => {
    const schema = { limit: BigInt };
    type Next = Program.Expression.Expression<
      Type.PrimitiveInteger,
      { readonly limit: Type.PrimitiveInteger }
    >;
    const next = (
      $: Draft.Body.Context<
        Program.Prelude.Builtin,
        Draft.Body.Requirements<typeof schema>
      >,
      { limit }: Draft.Body.Handles<typeof schema>,
    ): Next => $.let("next", $.prelude().add(limit, 1n));

    expectTypeOf(
      Draft.program(schema, ($, inputs) => next($, inputs)),
    ).toEqualTypeOf<Result.Result<Next, Program.ProgramError.Construction>>();
  });

  test("escaped_conditional", () => {
    Draft.program({ count: BigInt }, ($, { count }) => {
      const both = $.if(true, {
        then: (branch) => {
          branch.let("unused", count);
          return 1n;
        },
        else: () => 2n,
      });
      const thenOnly = $.if(true, {
        then: (branch) => {
          branch.let("unused", count);
          return 1n;
        },
      });
      expectTypeOf(both).toEqualTypeOf<
        Program.Expression.Expression<
          Type.PrimitiveInteger,
          { readonly count: Type.PrimitiveInteger }
        >
      >();
      expectTypeOf(thenOnly).toEqualTypeOf<
        Program.Expression.Expression<
          Context.Option<Type.PrimitiveInteger>,
          { readonly count: Type.PrimitiveInteger }
        >
      >();
      // @ts-expect-error the conditional emits the branch's binding of `count`
      Draft.program({}, () => both);
      // @ts-expect-error the then-only conditional emits it too
      Draft.program({}, () => thenOnly);
      Draft.program({ count: BigInt }, () => thenOnly);
      return both;
    });
  });

  test("then_only", () => {
    Draft.program({ flag: Boolean }, ($, { flag }) => {
      const maybe = $.if(flag, { then: () => 1n });
      expectTypeOf(maybe).toEqualTypeOf<
        Program.Expression.Expression<
          Context.Option<Type.PrimitiveInteger>,
          { readonly flag: Type.PrimitiveBoolean }
        >
      >();
      return $.isNone(maybe);
    });
  });

  test("optional_namespace", () => {
    Draft.withPrelude(optionalPrelude()).program({}, ($) => {
      expectTypeOf($.prelude().Integer).toEqualTypeOf<
        typeof integer | undefined
      >();
      expectTypeOf($.prelude()).not.toHaveProperty("Missing");
      return $.literal(true);
    });
  });

  test("nominal_rebinding", () => {
    type Struct = Type.Struct<{ readonly value: Type.PrimitiveInteger }>;
    type Constructor = Type.Function<
      readonly [Struct],
      Type.Opaque<"Box", Struct>
    >;
    Draft.program({ outside: integer }, ($) => {
      const Box = $.newtype("Box", { value: BigInt });
      expectTypeOf<
        Program.Expression.Value.Type<typeof Box>
      >().toEqualTypeOf<Constructor>();
      const bound = $.let("constructor", Box);
      expectTypeOf<
        Program.Expression.Value.Type<typeof bound>
      >().toEqualTypeOf<Constructor>();
      const pass = Expression.fromJExpr<
        Type.Function<readonly [Constructor], Constructor>,
        Program.Inputs.Empty
      >("::test::pass");
      const passed = pass(Box);
      expectTypeOf<
        Program.Expression.Value.Type<typeof passed>
      >().toEqualTypeOf<Constructor>();
      const module = Result.getOrThrow(
        Module.define("::test", { types: { Box }, values: { Box } }),
      );
      const names = Namespace.flatten(module);
      const moved = Result.getOrThrow(
        TypeExpression.relocate(
          names.Box,
          Result.getOrThrow(JExpr.Path.decodeResult("::local::Box")),
        ),
      );
      const value = moved({ value: outside });
      expectTypeOf<Program.Expression.Value.Type<typeof value>>().toEqualTypeOf<
        Type.Opaque<"Box", Struct>
      >();
      expectTypeOf<
        Program.Expression.Value.Inputs<typeof value>
      >().toEqualTypeOf<{
        readonly outside: Type.PrimitiveInteger;
      }>();
      // @ts-expect-error rebinding must not widen nominal structure
      moved({ value: "wrong" });
      return value;
    });
  });
});

describe("import", () => {
  test("import_names", () => {
    Draft.program({ outside: integer }, ($) => {
      const selected = $.import(requirements, { outside: "local" });
      expectTypeOf(selected).toHaveProperty("local");
      expectTypeOf(selected).not.toHaveProperty("outside");
      expectTypeOf(selected).not.toHaveProperty("Integer");
      expectTypeOf(selected.local).toEqualTypeOf<typeof outside>();
      // @ts-expect-error An import does not mutate the existing context's prelude type.
      expectTypeOf($.prelude().local);
      // @ts-expect-error A selection must name a declared export.
      $.import(requirements, ["absent"]);
      // @ts-expect-error Alias sources must name declared exports.
      $.import(requirements, { absent: "local" });
      return selected.local;
    });
  });

  test("import_requirements", () => {
    // @ts-expect-error Imported handles keep requirements from their declarations.
    Draft.program({}, ($) => $.import(requirements).outside);
    Draft.program({}, ($) => {
      const imported = $.import(requirements);
      // @ts-expect-error Discarding an initializer cannot conceal an imported requirement.
      $.let("discarded", imported.outside);
      return $.literal(true);
    });
    const result = Draft.program(
      { outside: integer },
      ($) => $.import(requirements).outside,
    );
    expectTypeOf<
      Program.Expression.Value.Inputs<Result.Result.Success<typeof result>>
    >().toEqualTypeOf<{ readonly outside: Type.PrimitiveInteger }>();
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
const graphProgram = Draft.withPrelude(graph).program;
const axes = TypeExpression.fromType<Program.Query.QueryTemporalAxes>(
  Option.getOrThrow(
    JExpr.Type.reference("::graph::temporal::QueryTemporalAxes"),
  ),
);
const outsideAxis = Expression.input("outsideAxis", axes);

/** An unrestricted helper's query keeps the predicate's requirements, which a program's `$` would reject. */
const unrestrictedQuery = <S extends Program.Scope.Scope.Any>(
  $: Context.Context<S>,
  entities: Program.Expression.Expression<
    Program.Query.Graph<Vertex>,
    Program.Inputs.Empty
  >,
): Context.Query<S, Vertex, { readonly flag: Type.PrimitiveBoolean }> =>
  $.query(entities).filter("vertex", () =>
    Expression.input("flag", Structural.type(Boolean)),
  );

/** An unrestricted helper's entity query keeps axes from outside any schema, which a program's `$` would reject. */
const unrestrictedEntities = <S extends Program.Scope.Scope.Any>(
  $: Context.Context<S>,
): Context.Query<
  S,
  Program.Query.Entity,
  { readonly outsideAxis: Program.Query.QueryTemporalAxes }
> => $.query.entities(outsideAxis);

describe("query", () => {
  test("vertex", () => {
    const result = graphProgram({ axis: BigInt }, ($, { axis }) =>
      $.query($.prelude().entities(axis))
        .filter("vertex", (predicate, vertex) => {
          expectTypeOf(vertex).toEqualTypeOf<
            Program.Expression.Expression<Vertex, Program.Inputs.Empty>
          >();
          return predicate.isTrue(vertex.enabled);
        })
        .collect(),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Program.Expression.Expression<
          Type.List<Vertex>,
          { readonly axis: Type.PrimitiveInteger }
        >,
        Program.ProgramError.Construction
      >
    >();
    graphProgram({}, ($) => {
      const entities = $.prelude().entities(1n);
      // @ts-expect-error A predicate returns a Boolean, not a vertex.
      $.query(entities).filter("vertex", (_, vertex) => vertex);
      // @ts-expect-error A predicate does not accept numeric truthiness.
      $.query(entities).filter("vertex", () => 1);
      // @ts-expect-error Only a graph starts a query.
      $.query($.literal(true));
      return $.literal(true);
    });
  });

  test("schema_checks", () => {
    const flag = Expression.input("flag", Structural.type(Boolean));
    const erased: Program.Expression.Value<Type.PrimitiveBoolean> = flag;
    graphProgram({}, ($) => {
      const entities = $.prelude().entities(1n);
      // @ts-expect-error The graph's inputs must fit the schema.
      $.query($.prelude().entities(outside));
      // @ts-expect-error A predicate's result must fit the schema.
      $.query(entities).filter("vertex", () => flag);
      $.query(entities).filter("vertex", (predicate) => {
        // @ts-expect-error A discarded predicate declaration must fit the schema.
        predicate.let("hidden", flag);
        return true;
      });
      // @ts-expect-error A predicate cannot prove erased requirements.
      $.query(entities).filter("vertex", () => erased);
      return $.literal(true);
    });
    const result = graphProgram({ flag: Boolean }, ($) =>
      $.query($.prelude().entities(1n))
        .filter("vertex", (predicate) => predicate.let("selected", flag))
        .collect(),
    );
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Program.Expression.Expression<
          Type.List<Vertex>,
          { readonly flag: Type.PrimitiveBoolean }
        >,
        Program.ProgramError.Construction
      >
    >();
  });

  test("unrestricted_context", () => {
    expectTypeOf(unrestrictedQuery);
  });

  test("entities", () => {
    const result = Draft.program({ axis: axes }, ($, { axis }) => {
      expectTypeOf($.query.entities(axis)).toEqualTypeOf(
        $.query(Program.Query.entities(axis)),
      );
      // @ts-expect-error The axes are a QueryTemporalAxes.
      $.query.entities(1n);
      // @ts-expect-error The axes' inputs must fit the schema.
      $.query.entities(outsideAxis);
      return $.query.entities(axis).collect();
    });
    expectTypeOf(result).toEqualTypeOf<
      Result.Result<
        Program.Expression.Expression<
          Type.List<Program.Query.Entity>,
          { readonly axis: Program.Query.QueryTemporalAxes }
        >,
        Program.ProgramError.Construction
      >
    >();
    expectTypeOf(unrestrictedEntities);
  });
});

describe("requirements", () => {
  test("structural_alternatives", () => {
    const structural = Structural.value<Box>()(chooseBox());
    // @ts-expect-error a closed annotation cannot discard the required host alternative
    const closed: Program.Expression.Expression<Box, Program.Inputs.Empty> =
      structural;
    expectTypeOf(closed);
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof structural>
    >().toEqualTypeOf<{
      readonly outside: Type.PrimitiveInteger;
    }>();
    const tuple =
      Structural.value<Type.Tuple<readonly [Type.PrimitiveInteger]>>()(
        chooseTuple(),
      );
    // @ts-expect-error tuple alternatives also keep every requirement
    const closedTuple: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof tuple>,
      Program.Inputs.Empty
    > = tuple;
    expectTypeOf(closedTuple);
    Draft.program({}, ($) => {
      const Nominal = $.newtype("Box", { foo: BigInt });
      const nominal = Nominal(chooseBox());
      // @ts-expect-error the nominal producer normalizes before exposing variance
      const closedNominal: Program.Expression.Expression<
        Program.Expression.Value.Type<typeof nominal>,
        Program.Inputs.Empty
      > = nominal;
      expectTypeOf(closedNominal);
      // @ts-expect-error discarded nominal initializers still need their inputs
      $.let("lost", nominal);
      // @ts-expect-error discarded structural initializers still need their inputs
      $.let("lostStruct", structural);
      return $.literal(true);
    });
    Draft.program({ outside: integer }, ($) => $.let("allowed", structural));
  });

  test("erased_requirements", () => {
    const erased: Program.Expression.Expression.Any = outside;
    const erasedValue: Program.Expression.Value<Type.PrimitiveInteger> =
      outside;
    const conditional = Expression.ifElse(true, {
      then: erasedValue,
      else: 1n,
    });
    const assumed = Expression.assume<Type.PrimitiveInteger>()(erased);
    const structural = Structural.value<Box>()({ foo: erasedValue });
    const call = Prelude.builtin.values.add(erasedValue, 1n);
    const defaulted = Expression.input("defaulted", integer, erasedValue);
    const erasedReceiver: Program.Expression.Expression<
      Type.PrimitiveInteger,
      never
    > = outside;
    const receiverCall = Operators.eq(erasedReceiver, outside);
    const erasedCallee: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof Prelude.builtin.values.add>,
      never
    > = Prelude.builtin.values.add;
    const calleeCall = erasedCallee(outside, 1n);
    const mixedAny = Expression.ifElse(true, { then: erased, else: 1n });
    const chooseErasedTuple = ():
      | readonly [typeof erasedValue]
      | readonly [bigint] => [erasedValue];
    const erasedTuple =
      Structural.value<Type.Tuple<readonly [Type.PrimitiveInteger]>>()(
        chooseErasedTuple(),
      );
    // @ts-expect-error an outer tuple alternative must not discard internal erasure
    const closedTuple: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof erasedTuple>,
      Program.Inputs.Empty
    > = erasedTuple;
    expectTypeOf(closedTuple);
    // @ts-expect-error a named argument cannot discharge an erased receiver
    const closedReceiver: Program.Expression.Expression<
      Type.PrimitiveBoolean,
      { readonly outside: Type.PrimitiveInteger }
    > = receiverCall;
    // @ts-expect-error a named argument cannot discharge an erased callee
    const closedCallee: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof calleeCall>,
      { readonly outside: Type.PrimitiveInteger }
    > = calleeCall;
    // @ts-expect-error a primitive branch cannot discharge an erased expression
    const closedAny: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof mixedAny>,
      Program.Inputs.Empty
    > = mixedAny;
    expectTypeOf(closedReceiver);
    expectTypeOf(closedCallee);
    expectTypeOf(closedAny);
    const mixed = Expression.ifElse(true, {
      then: alternative(erasedValue, Expression.integer(1)),
      else: 1n,
    });
    // @ts-expect-error conditional composition must not convert erasure to Empty
    const closed: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof conditional>,
      Program.Inputs.Empty
    > = conditional;
    // @ts-expect-error structural composition must not convert erasure to Empty
    const closedStruct: Program.Expression.Expression<
      Box,
      Program.Inputs.Empty
    > = structural;
    // @ts-expect-error argument composition must not convert erasure to Empty
    const closedCall: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof call>,
      Program.Inputs.Empty
    > = call;
    // @ts-expect-error the unknown host alternative cannot disappear
    const closedMixed: Program.Expression.Expression<
      Program.Expression.Value.Type<typeof mixed>,
      Program.Inputs.Empty
    > = mixed;
    expectTypeOf(closed);
    expectTypeOf(closedStruct);
    expectTypeOf(closedCall);
    expectTypeOf(closedMixed);
    // @ts-expect-error erased program output cannot prove the schema contract
    Draft.program({ outside: integer }, () => erased);
    Draft.program({ outside: integer, defaulted: integer }, ($) => {
      // @ts-expect-error even a matching schema cannot recover erased information
      $.let("any", erased);
      // @ts-expect-error Value<T> erases requirements too
      $.let("value", erasedValue);
      // @ts-expect-error conditional composition retains erasure
      $.let("conditional", conditional);
      // @ts-expect-error semantic assumptions do not recover input requirements
      $.let("assumed", assumed);
      // @ts-expect-error structural composition retains erasure
      $.let("structural", structural);
      // @ts-expect-error calls retain erasure
      $.let("call", call);
      // @ts-expect-error input defaults retain erasure
      $.let("defaulted", defaulted);
      // @ts-expect-error callee requirements remain erased after argument composition
      $.let("callee", calleeCall);
      // @ts-expect-error receiver requirements remain erased after operand composition
      $.let("receiver", receiverCall);
      const Nominal = $.newtype("Erased", { foo: BigInt });
      const nominal = Nominal({ foo: erasedValue });
      // @ts-expect-error nominal composition cannot restore erased requirements
      const closedNominal: Program.Expression.Expression<
        Program.Expression.Value.Type<typeof nominal>,
        Program.Inputs.Empty
      > = nominal;
      expectTypeOf(closedNominal);
      // @ts-expect-error nominal initializers retain erased requirements
      $.let("nominal", nominal);
      $.if(true, {
        // @ts-expect-error callback branches cannot accept erased values
        then: () => erasedValue,
        else: () => 1n,
      });
      return $.literal(true);
    });
  });

  test("schema_alternatives", () => {
    const result = Draft.program(chooseSchema(), ($) => $.literal(true));
    // @ts-expect-error an empty alternative does not remove the explicit schema promise
    const closed: Program.Expression.Expression<
      Type.PrimitiveBoolean,
      Program.Inputs.Empty
    > = Result.getOrThrow(result);
    expectTypeOf(closed);
    const output = Result.getOrThrow(result);
    expectTypeOf<
      Program.Expression.Value.Inputs<typeof output>
    >().toEqualTypeOf<{
      readonly outside: Type.PrimitiveInteger;
    }>();
    const branch = Draft.program(chooseSchema(), ($) =>
      $.if(true, {
        then: (child) => child.let("outside", outside),
        else: () => 1n,
      }),
    );
    // @ts-expect-error child contexts retain the conservative schema
    const closedBranch: Program.Expression.Expression<
      Type.PrimitiveInteger,
      Program.Inputs.Empty
    > = Result.getOrThrow(branch);
    expectTypeOf(closedBranch);
  });

  test("joined_expression_operations", () => {
    const child = Result.getOrThrow(
      Module.define("::child", {
        values: {
          then: Module.value<Type.PrimitiveInteger>(),
          $: Module.value<Type.PrimitiveInteger>(),
        },
      }),
    );
    Draft.withPrelude({
      modules: { Both: child },
      values: { Both: outside },
    }).program({ outside: integer }, ($) => {
      const { Both } = $.prelude();
      const thenValue = Both.then;
      const dollarValue = Both.$;
      expectTypeOf(dollarValue).toEqualTypeOf<typeof child.values.$>();
      expectTypeOf(Both).not.toHaveProperty("$project");
      expectTypeOf(Both).not.toHaveProperty("$index");
      expectTypeOf($.modules().Both.then).toEqualTypeOf<
        typeof child.values.then
      >();
      expectTypeOf(thenValue).toEqualTypeOf<typeof child.values.then>();
      expectTypeOf(Both.values.then).toEqualTypeOf<
        Program.Expression.Expression<
          Type.PrimitiveInteger,
          Program.Inputs.Empty
        >
      >();
      return $.literal(true);
    });
  });
});
