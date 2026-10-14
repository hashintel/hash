/**
 * A checked tour of the HashQL TypeScript SDK.
 *
 * Each test pairs code you can write and the type TypeScript infers for it with a limitation and its supported workaround. `tsc` and `vitest --typecheck` check this file. Neither of them runs it. A rejected line carries `@ts-expect-error`, so the check fails both when an inference changes and when an expected rejection disappears.
 *
 * Type checking covers the authoring API. It does not execute HashQL. The SDK constructs syntax, and the HashQL compiler resolves names, checks scopes and type-checks the emitted program. Construction failures, such as an invalid binding name, arrive as a `Result` failure at run time and do not appear in these types.
 *
 * @module
 */
// oxlint-disable hash/naming-conventions -- HashQL type and constructor names keep their PascalCase spelling in callback arguments
// oxlint-disable vitest/prefer-expect-assertions -- type tests run through the compiler, not the runtime assertion counter
// oxlint-disable eslint/no-magic-numbers -- literal values demonstrate the numeric types
import { Result } from "effect";
import { describe, expectTypeOf, test } from "vitest";

import {
  Type as Alias,
  Import,
  Let,
  Newtype,
  withPrelude,
} from "../src/do/index.js";
import { Expression, Module, Program } from "../src/main.js";

import type {
  Inputs,
  ProgramError,
  Type,
  TypeExpression,
} from "../src/main.js";

// Declarations bind TypeScript descriptions of HashQL types to absolute paths. The SDK trusts these annotations and includes no standard-library bundle, so the fixtures below describe only what the tour uses. Application code yields each `Result` inside `Result.gen`. The tour unwraps them with `getOrThrow`.

type NullableString = Type.Union<
  readonly [Type.PrimitiveString, Type.PrimitiveNull]
>;

type Person = Type.Struct<{
  readonly name: Type.PrimitiveString;
  readonly archived: Type.PrimitiveBoolean;
  readonly scores: Type.List<Type.PrimitiveInteger>;
  readonly labels: Type.Dict<Type.PrimitiveString, Type.PrimitiveString>;
  readonly location: Type.Tuple<
    readonly [Type.PrimitiveInteger, Type.PrimitiveInteger]
  >;
  readonly then: Type.PrimitiveString;
}>;

// The query helpers recognize a graph by this opaque shape. Its marker field names the vertex type.
type PersonGraph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Person }>
>;
type TemporalAxes = Type.Opaque<
  "::graph::temporal::QueryTemporalAxes",
  Type.Unknown
>;

const kernel = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: {
      Integer: Module.type<Type.PrimitiveInteger>(),
      String: Module.type<Type.PrimitiveString>(),
      Boolean: Module.type<Type.PrimitiveBoolean>(),
    },
  }),
);

const profile = Result.getOrThrow(
  Module.define("::example::profile", {
    values: {
      greet:
        Module.value<
          Type.Function<readonly [NullableString], Type.PrimitiveString>
        >(),
      length:
        Module.value<
          Type.Function<readonly [Type.PrimitiveString], Type.PrimitiveInteger>
        >(),
    },
  }),
);

const head = Result.getOrThrow(
  Module.define("::graph::head", {
    values: {
      entities:
        Module.value<Type.Function<readonly [TemporalAxes], PersonGraph>>(),
    },
  }),
);

const temporal = Result.getOrThrow(
  Module.define("::graph::tmp", {
    values: {
      decision_time_now:
        Module.value<Type.Function<readonly [], TemporalAxes>>(),
    },
  }),
);

// A prelude seeds the environments without emitting imports. `$.query` offers `entities` because the value environment holds a graph-returning `entities`.
const { Do } = withPrelude({
  modules: { kernel, profile },
  values: {
    entities: head.values.entities,
    now: temporal.values.decision_time_now,
  },
});

type Closed<T extends Type.Any> = Expression.Expression<T, Inputs.Empty>;
type Built<T extends Type.Any, Inputs> = Result.Result<
  Expression.Expression<T, Inputs>,
  ProgramError.Construction
>;

declare const person: Closed<Person>;
declare const text: Closed<Type.PrimitiveString>;

describe("reusable_expressions", () => {
  test("inputs_and_defaults", () => {
    // An expression is a value you can store and reuse. Its second type parameter records the host inputs it needs.
    const count = Expression.input("count", kernel.types.Integer);
    const nonzero = count.$.ne(0n);
    expectTypeOf(nonzero).toEqualTypeOf<
      Expression.Expression<
        Type.PrimitiveBoolean,
        { readonly count: Type.PrimitiveInteger }
      >
    >();

    // A default makes the input optional for the host.
    const page = Expression.input("page", kernel.types.Integer, 1n);
    expectTypeOf<Expression.Inputs<typeof page>>().toEqualTypeOf<{
      readonly page?: Type.PrimitiveInteger;
    }>();

    // A program that reuses `nonzero` inherits its requirement.
    const root = Result.getOrThrow(
      Do(($) => nonzero.$.and($.input("enabled", kernel.types.Boolean, true))),
    );
    const program = Program.program(root);
    expectTypeOf<Program.Inputs<typeof program>>().toEqualTypeOf<{
      readonly count: Type.PrimitiveInteger;
      readonly enabled?: Type.PrimitiveBoolean;
    }>();

    // Limitation: an annotation cannot hide a requirement.
    // @ts-expect-error A closed expression type has no room for `count`.
    const hidden: Closed<Type.PrimitiveBoolean> = nonzero;
    expectTypeOf(hidden);
    // Workaround: let TypeScript infer the type, or name the requirement.
    const named: Expression.Expression<
      Type.PrimitiveBoolean,
      Expression.Inputs<typeof nonzero>
    > = nonzero;
    expectTypeOf(named).toEqualTypeOf(nonzero);

    // @ts-expect-error The default for an Integer input cannot be a Boolean.
    Expression.input("count", kernel.types.Integer, true);
  });

  test("conflicting_input_names", () => {
    // Uses of one input name intersect their types. A required use makes the name required.
    const asInteger = Expression.input("shared", kernel.types.Integer);
    const asString = Expression.input("shared", kernel.types.String);
    const both = Expression.ifElse(true, {
      // oxlint-disable-next-line unicorn/no-thenable -- the conditional names its branches `then` and `else`
      then: asInteger,
      else: asString,
    });

    // Limitation: incompatible primitives produce `Never` in the record rather than a compile error at the use site.
    expectTypeOf<Expression.Inputs<typeof both>>().toEqualTypeOf<{
      readonly shared: Type.Never;
    }>();

    // Workaround: give inputs of different types different names.
    const renamed = Expression.ifElse(true, {
      // oxlint-disable-next-line unicorn/no-thenable -- the conditional names its branches `then` and `else`
      then: asInteger,
      else: Expression.input("label", kernel.types.String),
    });
    expectTypeOf<Expression.Inputs<typeof renamed>>().toEqualTypeOf<{
      readonly shared: Type.PrimitiveInteger;
      readonly label: Type.PrimitiveString;
    }>();
  });
});

const userId: unique symbol = Symbol("UserId");
const accountId: unique symbol = Symbol("AccountId");
type UserId = Type.Opaque<typeof userId, Type.PrimitiveInteger>;

describe("declarations", () => {
  test("imports_and_aliases", () => {
    const built = Do(
      // Select names, and rename some of them. An alias of `"_"` keeps the original name.
      Import((_, { kernel }) => kernel, { Integer: "Int", String: "_" }),
      // A type alias preserves the underlying semantic type.
      Alias("Count", (_, { Int }) => Int),
      ($, _values, { Count, String }) => {
        expectTypeOf(Count).toEqualTypeOf<typeof kernel.types.Integer>();
        expectTypeOf(String).toEqualTypeOf<typeof kernel.types.String>();
        // `$.ref` reaches module members without importing them.
        return $.ref.profile.values.length($.input("name", String));
      },
    );
    expectTypeOf(built).toEqualTypeOf<
      Built<Type.PrimitiveInteger, { readonly name: Type.PrimitiveString }>
    >();

    // Limitation: a selection must name an export of the declared module.
    // @ts-expect-error This kernel declaration exports no `Missing`.
    Import(() => kernel, ["Missing"]);
    // Workaround: add the export to the module declaration, then import it.
  });

  test("nominal_types", () => {
    Do(
      Import((_, { kernel }) => kernel),
      // A newtype introduces a nominal type and its constructor under one name. The unique symbol supplies TypeScript's identity and is not emitted.
      Newtype("UserId", userId, (_, { Integer }) => Integer),
      Let("owner", (_, { UserId }) => UserId(1n)),
      ($, { owner, UserId }, types) => {
        expectTypeOf(owner).toEqualTypeOf<Closed<UserId>>();
        expectTypeOf(types.UserId).toEqualTypeOf<
          TypeExpression.TypeExpression<UserId>
        >();

        // Limitation: the representation does not have the nominal type.
        // @ts-expect-error An Integer default does not have type UserId.
        $.input("id", types.UserId, 2n);
        // Workaround: wrap the representation with the constructor.
        return $.input("id", types.UserId, UserId(2n));
      },
    );

    // oxlint-disable-next-line typescript/no-inferrable-types -- shows the rejection after widening drops the unique symbol type
    const widened: symbol = Symbol("UserId");
    // @ts-expect-error A widened `symbol` cannot tell declarations apart.
    Newtype("UserId", widened, () => kernel.types.Integer);
  });

  test("shadowing", () => {
    Do(
      Import((_, { kernel }) => kernel),
      Newtype("Id", userId, (_, { Integer }) => Integer),
      Let("first", (_, { Id }) => Id(1n)),
      // A later declaration shadows a name for the steps after it.
      Newtype("Id", accountId, (_, { Integer }) => Integer),
      // Values and types live in separate environments. This value named `Integer` leaves the type `Integer` untouched.
      Let("Integer", ($) => $.literal("not a type")),
      (_, { first, Id, Integer }, types) => {
        expectTypeOf(first).toEqualTypeOf<Closed<UserId>>();
        expectTypeOf(Integer).toEqualTypeOf<Closed<Type.PrimitiveString>>();
        expectTypeOf(types.Integer).toEqualTypeOf<
          typeof kernel.types.Integer
        >();

        // Limitation: the same HashQL spelling does not make two nominal types equal.
        // @ts-expect-error The shadowed `Id` built `first`.
        const mixed: typeof first = Id(2n);
        expectTypeOf(mixed);
        // Workaround: a binding keeps its declared type, so keep using `first`.
        return first;
      },
    );
  });
});

describe("expressions", () => {
  test("projections", () => {
    // Struct fields and tuple positions become typed properties.
    expectTypeOf(person.name).toEqualTypeOf<Closed<Type.PrimitiveString>>();
    expectTypeOf(person.location[0]).toEqualTypeOf<
      Closed<Type.PrimitiveInteger>
    >();
    // `$project` spells the same projection explicitly.
    expectTypeOf(person.$project("archived")).toEqualTypeOf<
      typeof person.archived
    >();

    expectTypeOf(person.then).toEqualTypeOf<Closed<Type.PrimitiveString>>();
    expectTypeOf(person.$project("then")).toEqualTypeOf<
      Closed<Type.PrimitiveString>
    >();

    // @ts-expect-error A struct has only its declared fields.
    expectTypeOf(person.email);
  });

  test("indexing", () => {
    // Indexing a list or dictionary may find nothing, so the result includes `Null`.
    type MaybeInteger = Type.Union<
      readonly [Type.PrimitiveInteger, Type.PrimitiveNull]
    >;
    expectTypeOf(person.scores.$index(0n)).toEqualTypeOf<
      Closed<MaybeInteger>
    >();
    expectTypeOf(person.labels.$index(text)).toEqualTypeOf<
      Closed<NullableString>
    >();

    // Limitation: the key must have the declared key type.
    // @ts-expect-error List positions are Integer expressions.
    person.scores.$index(text);
    // Workaround: supply an Integer-producing expression or a bigint.
    expectTypeOf(
      person.scores.$index(profile.values.length(text)),
    ).toEqualTypeOf<Closed<MaybeInteger>>();
  });

  test("calls", () => {
    // A declared function value is callable with typed arguments.
    const length = profile.values.length(person.name);
    expectTypeOf(length).toEqualTypeOf<Closed<Type.PrimitiveInteger>>();
    // Arguments contribute their inputs to the call.
    const typed = profile.values.length(
      Expression.input("name", kernel.types.String),
    );
    expectTypeOf<Expression.Inputs<typeof typed>>().toEqualTypeOf<{
      readonly name: Type.PrimitiveString;
    }>();

    // @ts-expect-error `length` takes a String.
    profile.values.length(person.archived);
    // @ts-expect-error `length` takes exactly one argument.
    profile.values.length(text, text);
  });

  test("query_composition", () => {
    // Keep a predicate as an ordinary function and reuse it across queries.
    const active = (vertex: Closed<Person>): Closed<Type.PrimitiveBoolean> =>
      vertex.archived.$.isFalse();

    const built = Do(($, { now }) =>
      $.query
        .entities(now())
        .filter("person", active)
        .filter("person", (vertex) =>
          vertex.name.$.eq($.input("name", kernel.types.String)),
        )
        .collect(),
    );
    // The query's vertex type comes from the `entities` declaration, and inputs from every filter accumulate in the result.
    expectTypeOf(built).toEqualTypeOf<
      Built<Type.List<Person>, { readonly name: Type.PrimitiveString }>
    >();

    Do(($, { now }) => {
      // @ts-expect-error A filter predicate must return a Boolean.
      $.query.entities(now()).filter("person", (vertex) => vertex.name);
      return $.literal(true);
    });
  });
});

describe("subtyping", () => {
  test("numeric_host_types", () => {
    // Numeric typing follows the host type, not whether the value has a fraction.
    const number = Expression.literal(1);
    const integer = Expression.literal(1n);
    expectTypeOf(number).toEqualTypeOf<Closed<Type.PrimitiveNumber>>();
    expectTypeOf(integer).toEqualTypeOf<Closed<Type.PrimitiveInteger>>();

    const acceptsNumber = Expression.fromJExpr<
      Type.Function<readonly [Type.PrimitiveNumber], Type.PrimitiveNumber>,
      Inputs.Empty
    >("accepts_number");
    expectTypeOf(acceptsNumber(1)).toEqualTypeOf<
      Closed<Type.PrimitiveNumber>
    >();
    // @ts-expect-error Integer does not implicitly widen to Number.
    acceptsNumber(integer);
    // @ts-expect-error A primitive bigint has the same restriction.
    acceptsNumber(1n);
    const assumed = Expression.assume<Type.PrimitiveNumber>()(integer);
    expectTypeOf(acceptsNumber(assumed)).toEqualTypeOf<
      Closed<Type.PrimitiveNumber>
    >();
  });

  test("explicit_widening", () => {
    // HashQL accepts a String where a function expects `String | Null`. The SDK compares semantic types exactly and does not model subtyping. Limitation: the SDK rejects a semantic subtype.
    // @ts-expect-error `greet` declares `String | Null`, and `text` is a String.
    profile.values.greet(text);

    // Workaround: state the wider type with `Expression.assume`. It changes only the SDK annotation. It emits no conversion and no HashQL type assertion, and the compiler still checks the program.
    const widened = Expression.assume<NullableString>()(text);
    expectTypeOf(profile.values.greet(widened)).toEqualTypeOf<
      Closed<Type.PrimitiveString>
    >();
  });

  test("assumed_inputs", () => {
    const name = Expression.input("name", kernel.types.String);
    const widened = Expression.assume<NullableString>()(name);
    // The input keeps its declared type. Only the expression's annotation changes.
    expectTypeOf(widened).toEqualTypeOf<
      Expression.Expression<
        NullableString,
        { readonly name: Type.PrimitiveString }
      >
    >();

    // Limitation: `assume` cannot discard a requirement.
    // @ts-expect-error The assumed expression still needs `name`.
    const closed: Closed<NullableString> = widened;
    expectTypeOf(closed);
    // Workaround: supply a default to make the input optional for the host.
    const defaulted = Expression.assume<NullableString>()(
      Expression.input("name", kernel.types.String, ""),
    );
    expectTypeOf<Expression.Inputs<typeof defaulted>>().toEqualTypeOf<{
      readonly name?: Type.PrimitiveString;
    }>();
  });
});

describe("lexical_scope", () => {
  test("callback_scope", () => {
    Do(
      Let("outer", ($) => $.integer(1)),
      ($, { outer }) =>
        $.if(
          $.literal(true),
          () => $.Let("inner", () => outer).Expr((_, { inner }) => inner),
          () =>
            $.Expr((_, values) => {
              // TypeScript types each callback environment as a record, which gives completion and catches misspelt names while you write.
              // @ts-expect-error The sibling branch's binding is absent here.
              expectTypeOf(values.inner);
              return values.outer;
            }),
        ),
    );
  });

  test("escaped_reference", () => {
    // Limitation: a handle is a reference to a HashQL name. JavaScript can carry it out of the block that binds the name, and TypeScript accepts the result.
    let escaped: Closed<Type.PrimitiveInteger> = Expression.integer(0);
    Do(
      Let("local", ($) => $.integer(1)),
      (_, { local }) => {
        escaped = local;
        return local;
      },
    );
    const outside = Do(() => escaped);
    expectTypeOf(outside).toEqualTypeOf<
      Built<Type.PrimitiveInteger, Inputs.Empty>
    >();

    // The SDK neither resolves names nor checks scopes. The HashQL compiler reports `local` as an unresolved variable when it checks the emitted program. Workaround: take handles from the callback arguments of the block that uses them, and leave free-reference checks to the compiler.
  });
});

describe("queries_and_let", () => {
  test("bound_query", () => {
    Do(
      Let("people", ($, { now }) => $.query.entities(now())),
      (_, { people }) => {
        // `Let` gives its binding the plain expression type of the value.
        expectTypeOf(people).toEqualTypeOf<Closed<PersonGraph>>();

        // The binding loses the query methods. This is an unfinished SDK convenience.
        // @ts-expect-error `filter` exists only on the query chain.
        expectTypeOf(people.filter);
        return people;
      },
    );
  });

  test("bind_after_collect", () => {
    // Workaround: build the whole chain in one expression, and bind its collected result or the values the query depends on.
    const built = Do(
      Let("axes", (_, { now }) => now()),
      Let("people", ($, { axes }) =>
        $.query
          .entities(axes)
          .filter("person", (vertex) => vertex.archived.$.isFalse())
          .collect(),
      ),
      (_, { people }) => people.$index(0n),
    );
    expectTypeOf(built).toEqualTypeOf<
      Built<Type.Union<readonly [Person, Type.PrimitiveNull]>, Inputs.Empty>
    >();
  });
});
