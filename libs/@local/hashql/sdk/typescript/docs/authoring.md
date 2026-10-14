# Authoring HashQL with the TypeScript SDK

The `@local/hashql` package builds HashQL programs from TypeScript. You describe the HashQL modules a program uses and compose expressions from typed handles. The SDK then serializes the result to J-Expr, the JSON syntax the HashQL compiler reads. The SDK neither runs nor compiles a query. It gives you typed composition and a syntax tree, and the HashQL compiler decides whether that tree is a valid program.

Shared types, expressions and `Program` come from `@local/hashql`. Import Do authoring calls from `@local/hashql/do`. The resulting expressions use the same shared representation.

This guide starts with one complete program and then works through each part of the API with focused examples. The [authoring rules](#authoring-rules) at the end condense it into rules that a person or a coding agent can follow while writing a program.

## What checks a program

TypeScript, construction and the HashQL compiler each catch different mistakes.

| Stage           | When it runs                 | What it checks                                                                                                                                               |
| --------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| TypeScript      | While you write the code     | Which names each step can see, call arguments, projections, indexing, nominal identity and input requirements, all against the types your declarations state |
| Construction    | When your code calls the SDK | Binding, import, parameter and export names, module paths, type argument counts, finite numbers, block shape and J-Expr structure                            |
| HashQL compiler | When you compile the program | Name resolution, lexical scope, the actual types of the modules you declared and the rules for graph queries                                                 |

TypeScript and construction both trust your declarations. If you declare that `::core::math::add` takes two integers, the SDK accepts calls that match that declaration and nothing else. A program that type-checks and constructs can still fail to compile, for example when a declaration disagrees with the real definition or a reference leaves the scope that binds it. This guide shows what TypeScript and construction accept. Whether a program compiles is the compiler's answer, and this guide doesn't run the compiler.

## A complete first program

This program declares the two modules it uses, binds an optional `page` input and returns the next page number.

```ts
import { Result } from "effect";
import { Module, Program, program } from "@local/hashql";
import { Import, Let, withPrelude } from "@local/hashql/do";
import type { Type } from "@local/hashql";

type IntegerOperation = Type.Function<
  readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
  Type.PrimitiveInteger
>;

const built = Result.gen(function* () {
  // Describe the HashQL declarations this program uses.
  const kernel = yield* Module.define("::kernel::type", {
    types: { Integer: Module.type<Type.PrimitiveInteger>() },
  });
  const math = yield* Module.define("::core::math", {
    values: { add: Module.value<IntegerOperation>() },
  });

  // Make the modules visible to the program's steps.
  const { Do } = withPrelude({ modules: { kernel, math } });

  const root = yield* Do(
    Import((_, { math }) => math, ["add"]),
    Let("page", ($) => $.input("page", $.ref.kernel.types.Integer, 1n)),
    (_, { page, add }) => add(page, 1n),
  );

  return program(root);
});

// The host may omit `page`, because the input has a default.
export type PageInputs = Program.Inputs<Result.Result.Success<typeof built>>;
// { readonly page?: Type.PrimitiveInteger }

const compiled = Result.flatMap(built, Program.compile);

Result.match(compiled, {
  onSuccess: (jexpr) => console.log(jexpr),
  onFailure: (error) => console.error(error.reason._tag, error.message),
});
```

The program has five parts.

1. `Module.define` binds TypeScript descriptions of HashQL types to absolute paths. It returns a `Result` because a path or export name can be invalid. The program yields that `Result` inside `Result.gen`.
2. `withPrelude` makes the modules available to every step without emitting any HashQL import.
3. `Do` takes declaration steps followed by one final callback. `Import` emits a HashQL `use` and brings `add` into the value environment. `Let` binds `page` to an input. The final callback returns the program's result expression.
4. `program(root)` wraps the result expression, and `Program.compile` serializes it to a J-Expr string. Both `Do` and `Program.compile` return a `Result`.
5. The caller handles both outcomes. A failure is a `ProgramError.Construction` with a tagged `reason`.

`IntegerOperation` limits this example's `add` declaration to its Integer-to-Integer specialization. The compiler's complete signature also supports other numeric arguments.

On success the program prints this J-Expr, shown here with line breaks:

```json
[
  "::kernel::special_form::use",
  "::core::math",
  { "#tuple": ["add"] },
  [
    "::kernel::special_form::let",
    "page",
    [
      "::kernel::special_form::input",
      "page",
      "::kernel::type::Integer",
      { "#literal": 1 }
    ],
    ["add", "page", { "#literal": 1 }]
  ]
]
```

## Shared declarations for the examples

The remaining examples are shorter. Each assumes the imports and declarations below, and states any further declarations it needs beside its own code.

```ts
import { Result } from "effect";
import { Expression, Module, Program } from "@local/hashql";
import {
  Do as EmptyDo,
  Import,
  Let,
  Newtype,
  Type as Alias,
  withPrelude,
} from "@local/hashql/do";
import type { Inputs, Type } from "@local/hashql";

const kernel = Result.getOrThrow(
  Module.define("::kernel::type", {
    types: {
      Boolean: Module.type<Type.PrimitiveBoolean>(),
      Integer: Module.type<Type.PrimitiveInteger>(),
      Number: Module.type<Type.PrimitiveNumber>(),
      String: Module.type<Type.PrimitiveString>(),
    },
  }),
);

const math = Result.getOrThrow(
  Module.define("::core::math", {
    values: {
      add: Module.value<
        Type.Function<
          readonly [Type.PrimitiveInteger, Type.PrimitiveInteger],
          Type.PrimitiveInteger
        >
      >(),
      sqrt: Module.value<
        Type.Function<readonly [Type.PrimitiveNumber], Type.PrimitiveNumber>
      >(),
    },
  }),
);

const { Do } = withPrelude({ modules: { kernel, math } });
```

These declarations never change and construct successfully, so the examples unwrap them with `Result.getOrThrow`. It throws if a declaration fails. In application code, prefer yielding each `Result` inside `Result.gen` as the first program does.

## Environments and steps

A program has three separate environments: modules, values and types. A value and a type can share a name. Each declaration changes only the environments it adds names to, so a `Let` never touches a type.

Each step's callback receives `$` first, followed by the environments that step may use:

| Step           | Callback arguments | Introduces                                              |
| -------------- | ------------------ | ------------------------------------------------------- |
| `Let`          | `$`, values, types | One value binding                                       |
| `Type`         | `$`, types         | One type alias                                          |
| `Newtype`      | `$`, types         | One nominal type and its constructor                    |
| `Import`       | `$`, modules       | The selected exports, in each environment that has them |
| Final callback | `$`, values, types | The block's result                                      |

`$` holds the helpers a callback needs:

- `$.literal`, `$.integer` and `$.number` turn host values into expressions.
- `$.input` declares a value the host supplies when it runs the query.
- `$.if` builds a HashQL conditional.
- `$.assume` changes an expression's TypeScript type without changing its syntax.
- `$.ref` holds the module environment, so `$.ref.math.values.add` reaches a declared value without importing it.
- `$.query` starts a graph query, when the value environment holds an `entities` function.
- `$.Let`, `$.Type`, `$.Newtype`, `$.Import` and `$.Expr` start a nested block.

`Do` from `@local/hashql/do` starts with empty environments. The imports above alias it as `EmptyDo` to distinguish it from the prelude-bound `Do`. `withPrelude` accepts optional `modules`, `values` and `types` records and returns `Do` together with `Let`, `Type`, `Newtype` and `Import`. The prelude only seeds the environments. It emits no HashQL. The same subpath exports all four declaration builders directly. The imports above alias the declaration builder `Type` as `Alias`, because `Type` from `@local/hashql` names the namespace of type descriptors.

## Declaring modules

`Module.define(path, definition)` binds declarations to an absolute HashQL path. The definition has optional `modules`, `types` and `values` records, and each key in them is one export:

- `Module.value<T>()` declares a value of type `T`, such as a function.
- `Module.type<T>()` declares a concrete type.
- `Module.genericType<Lambda>(arity)` declares a type constructor that takes `arity` type arguments.
- An existing module under `modules` becomes a child module. An existing export copied into another module keeps its original path.

These records are the only place where one JavaScript object describes more than one declaration. They describe what a module exports. Declaration steps inside a program work differently: each `Let`, `Type` or `Newtype` step declares exactly one name.

`Module.define` returns a `Result`. A relative path, an invalid path or an invalid export name produces a construction failure. `Module.root` assembles already defined modules into a tree and also returns a `Result`. Both copy and freeze their records, so later changes to your objects don't change a module.

A declaration is a trusted annotation. The package includes no standard library, so you write declarations for the parts of HashQL a program uses, including the graph functions a query needs. The compiler checks the emitted program against the real definitions. Generated declarations must take their types from the definitions they describe.

A module's values are expressions that refer to their absolute path. You can use them through `$.ref` without importing anything:

```ts
// Uses: math, Do.
const viaRef = Do(($) => $.ref.math.values.add(7n, 2n));
// Compiles to ["::core::math::add",{"#literal":7},{"#literal":2}]
```

## Ordered declarations and shadowing

`Do` runs its construction steps in order, and each step sees the names that earlier steps introduced. A later declaration shadows an earlier one of the same name, and only in its own environment.

This order determines callback name visibility, not a HashQL evaluation schedule. HashQL is pure, and a binding cannot refer to itself. The compiler orders the resulting bindings.

```ts
// Uses: kernel, Do.
const ordered = Do(
  Import((_, { kernel }) => kernel, ["Integer"]),
  Let("limit", ($) => $.integer(10)),
  Let("previous", (_, { limit }) => limit),
  // Shadows the value `limit` for the steps that follow.
  Let("limit", ($) => $.literal("ten")),
  // A value named `Integer` leaves the type `Integer` untouched.
  Let("Integer", ($) => $.literal("a value named Integer")),
  ($, { limit, previous }, { Integer }) =>
    $.if(
      limit.$.eq("ten"),
      () => previous,
      () => $.input("fallback", Integer),
    ),
);
```

In the final callback, `previous` is an Integer expression, `limit` is a String expression, and the type `Integer` is still the kernel type. Each `Let` emits a HashQL `let` that wraps the steps after it, so the second `limit` binding sits inside the first.

Each step declares one name. `Let`, `Type` and `Newtype` take a name and a callback that returns one expression or type. A callback can't return a record of declarations, so binding three values takes three `Let` steps.

The positional form of `Do` accepts up to eight declaration steps before the final callback. For more, continue with a nested block: `$` starts one, and its chained methods have no fixed step limit.

```ts
// Uses: Do.
const chained = Do(($) =>
  $.Let("first", ($) => $.integer(1))
    .Let("second", (_, { first }) => first)
    .Let("third", (_, { second }) => second)
    .Expr((_, { third }) => third),
);
```

A chain must end with `Expr`, which takes the final callback and returns the block's expression.

## Nominal identity

`Newtype` introduces a nominal type and its constructor under one name. The constructor wraps a value of the underlying type. A `unique symbol` gives the type its identity in TypeScript and isn't emitted.

```ts
// Uses: kernel, Do.
const userId: unique symbol = Symbol("UserId");
const accountId: unique symbol = Symbol("AccountId");

const owner = Do(
  Import((_, { kernel }) => kernel, ["Integer"]),
  Newtype("UserId", userId, (_, { Integer }) => Integer),
  Let("owner", (_, { UserId }) => UserId(1n)),
  ($, { owner, UserId }, types) => {
    // @ts-expect-error The representation 2n doesn't have the nominal type.
    $.input("id", types.UserId, 2n);
    return $.if(
      owner.$.eq(UserId(1n)),
      () => $.input("id", types.UserId, UserId(2n)),
      () => owner,
    );
  },
);
```

`types.UserId` is the nominal type, and the value `UserId` is its constructor. To pass an Integer where the program needs a `UserId`, wrap it with the constructor.

Declarations that share a HashQL name are different types in TypeScript when their symbols differ:

```ts
// Uses: kernel, Do, userId and accountId from the previous example.
const shadowedId = Do(
  Import((_, { kernel }) => kernel, ["Integer"]),
  Newtype("Id", userId, (_, { Integer }) => Integer),
  Let("first", (_, { Id }) => Id(1n)),
  Newtype("Id", accountId, (_, { Integer }) => Integer),
  (_, { first, Id }) => {
    // @ts-expect-error The later `Id` is a different nominal type.
    first.$.eq(Id(2n));
    return first;
  },
);
```

Give each `Newtype` its own `unique symbol`, including declarations that share a HashQL name. A symbol widened to plain `symbol` can't tell declarations apart, and TypeScript rejects it.

`Type` declares an alias instead. An alias keeps the underlying type, so `Alias("Count", (_, { Integer }) => Integer)` produces a type that TypeScript treats as Integer. `Type` and `Newtype` currently declare concrete types only, without type parameters.

## Imports and renaming

`Import` takes a callback that selects a module from the module environment and an optional selection. It emits a HashQL `use` around the steps that follow and adds local names for the selected exports:

- `Import(select)` imports every export.
- `Import(select, ["add", "sqrt"])` imports the listed exports.
- `Import(select, { add: "sum" })` imports `add` under the local name `sum`. An alias of `"_"` keeps the original name.

```ts
// Uses: kernel, math, Do.
const imported = Do(
  Import((_, { math }) => math, { add: "sum" }),
  Import((_, { kernel }) => kernel, { Integer: "_", String: "Text" }),
  ($, { sum }, { Integer }) => sum($.input("count", Integer), 2n),
);
```

A selected name enters every environment in which the module exports it, so one import provides both a type and a constructor of the same name. TypeScript rejects a selection that names no export of the declared module.

Importing a child module adds it to the module environment under its local name. `$.ref` then reaches it by that name:

```ts
// Uses: math.
const core = Result.getOrThrow(Module.define("::core", { modules: { math } }));

const viaChild = withPrelude({ modules: { core } }).Do(
  Import((_, { core }) => core, { math: "m" }),
  ($) => $.ref.m.values.add(7n, 2n),
);
// Compiles to a `use` of `::core` around a call to `m::add`.
```

Refer to declarations through handles: callback environments, imports and `$.ref`. A string is always a string literal. `$.literal("add")` is the text `"add"`, not a reference to the function.

## Projections and indexing

An expression handle offers the fields and positions of its type as typed properties. This example declares a `Profile` type in a hypothetical `::example::profile` module, which stands for a module in your own HashQL environment.

```ts
// Uses: Do. Declares the module below.
type Profile = Type.Struct<{
  readonly name: Type.PrimitiveString;
  readonly scores: Type.List<Type.PrimitiveInteger>;
  readonly labels: Type.Dict<Type.PrimitiveString, Type.PrimitiveString>;
  readonly location: Type.Tuple<
    readonly [Type.PrimitiveNumber, Type.PrimitiveNumber]
  >;
}>;

const profiles = Result.getOrThrow(
  Module.define("::example::profile", {
    types: { Profile: Module.type<Profile>() },
  }),
);

const label = withPrelude({ modules: { profiles } }).Do(
  Import((_, { profiles }) => profiles, ["Profile"]),
  Let("profile", ($, _values, { Profile }) => $.input("profile", Profile)),
  (_, { profile }) => profile.labels.$index(profile.name),
);
```

With `profile` bound to a `Profile` expression, these accessors are available:

| Expression                   | Result type       |
| ---------------------------- | ----------------- |
| `profile.name`               | `String`          |
| `profile.$project("name")`   | `String`          |
| `profile.location[0]`        | `Number`          |
| `profile.scores.$index(0n)`  | `Integer \| Null` |
| `profile.labels.$index("x")` | `String \| Null`  |

Indexing a list or dictionary includes `Null` in its result type, because the key might not be present. A list key is an Integer, and a dictionary key has the dictionary's key type. A field the struct doesn't declare is a TypeScript error. A projection or index requires the inputs of the expression it reads, together with those of its key.

Projections reach through opaque types to their representation. A union or intersection offers a field when every member offers it.

Direct access to a `then` field returns `undefined`. This stops JavaScript from treating a handle as a Promise. Use `$project("then")` for that field. `$project` and `$index` also work for any other field or key.

## Typed calls

A handle whose type is a function is callable with typed arguments.

```ts
// Uses: kernel, math, Do.
const sum = Do(($) => {
  const count = $.input("count", $.ref.kernel.types.Integer);
  // @ts-expect-error `add` takes Integer arguments, and 2 is a Number.
  $.ref.math.values.add(count, 2);
  // @ts-expect-error `add` takes exactly two arguments.
  $.ref.math.values.add(count);
  return $.ref.math.values.add(count, 2n);
});
```

The result has the declared return type, and its input requirements combine those of the callee and every argument. Here `sum` requires a `count` input.

Module values are ordinary handles, so you can call them outside a block as well: `math.values.add(7n, 2n)` is an Integer expression.

For a function whose types depend on its arguments, declare `Type.GenericFunction<Signature>` with a `Type.FunctionSignature` that maps the argument types to a function type. The SDK applies the signature at each call and doesn't infer it from HashQL.

## Value operations

The `.$` property of a handle exposes value operations that emit standard-library calls:

- `eq` and `ne` compare with a value of the same type, emitting `::core::cmp::eq` and `::core::cmp::ne`.
- On Boolean expressions, `and`, `or`, `isTrue` and `isFalse` emit `::core::bool::and`, `::core::bool::or` and comparisons with `true` or `false`.
- On a union that includes the `::core::option::None` opaque type, `isNone` compares with `None`.

The operand of `eq` or `ne` must have exactly the receiver's type, and the operand of `and` or `or` must be Boolean. A matching host primitive also works. The [primitives section](#primitives-and-explicit-assumptions) explains what "exactly" means here.

## Queries

`$.query` builds graph queries. It exists when the value environment holds an `entities` function that returns a graph type, `Type.Opaque<"::graph::Graph", …>`. The graph type's `'marker` field names the vertex type, and the SDK reads the query's vertex type from it.

The package doesn't generate these declarations. Like the module declarations above, they are yours to write. This example declares only the entity field it reads:

```ts
// Uses: kernel. Declares the graph fixtures below.
type Entity = Type.Opaque<
  "::graph::types::knowledge::entity::Entity",
  Type.Struct<{
    readonly metadata: Type.Struct<{
      readonly archived: Type.PrimitiveBoolean;
    }>;
  }>
>;
type EntityGraph = Type.Opaque<
  "::graph::Graph",
  Type.Struct<{ readonly "'marker": Entity }>
>;
type TemporalAxes = Type.Opaque<
  "::graph::temporal::QueryTemporalAxes",
  Type.Unknown
>;

const head = Result.getOrThrow(
  Module.define("::graph::head", {
    values: {
      entities:
        Module.value<Type.Function<readonly [TemporalAxes], EntityGraph>>(),
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

const graph = withPrelude({
  modules: { kernel },
  values: {
    entities: head.values.entities,
    now: temporal.values.decision_time_now,
  },
});
```

A query starts at `$.query.entities(...)`, adds filters and ends with `collect()`:

```ts
// Uses: the graph fixtures above.
const isLive = (entity: Expression.Expression<Entity, Inputs.Empty>) =>
  entity.metadata.archived.$.isFalse();

const live = graph.Do(($, { now }) =>
  $.query
    .entities(now())
    .filter("entity", isLive)
    .filter("entity", (entity) =>
      entity.metadata.archived.$.eq(
        $.input("archived", $.ref.kernel.types.Boolean, false),
      ),
    )
    .collect(),
);
```

`live` is a construction Result containing one list-valued expression, with an optional `archived` input. Each `filter` emits a closure whose parameter has the name you pass, so that name must be a valid identifier. A predicate is an ordinary function from a vertex expression to a Boolean expression, and you can reuse it across queries. Predicate inputs accumulate in the query's requirements.

### Queries and `Let`

A `Let` binding holds a plain expression of the bound value's type. A query stored in a binding loses `filter` and `collect`. This is intentional: it matches a restriction the HashQL compiler places on graph query chains. Build the whole chain in one expression, and bind the collected result or the values the query depends on:

```ts
// Uses: the graph fixtures and isLive above.
const firstLive = graph.Do(
  Let("axes", (_, { now }) => now()),
  Let("live", ($, { axes }) =>
    $.query.entities(axes).filter("entity", isLive).collect(),
  ),
  (_, { live }) => live.$index(0n),
);
```

Binding `$.query.entities(axes)` without `collect()` gives a binding of the graph type, and TypeScript reports `filter` on it as an unknown property.

## Input requirements

An expression handle has two types: the HashQL type of its value, and a record of the inputs it requires. `Expression.Expression<T, Inputs>` carries both. Composition combines the records, so a reusable expression keeps its requirements wherever you use it.

```ts
// Uses: kernel, Do.
const count = Expression.input("count", kernel.types.Integer);
const nonzero = count.$.ne(0n);
// Expression.Expression<Type.PrimitiveBoolean, { readonly count: Type.PrimitiveInteger }>

const enabled = Do(($) =>
  nonzero.$.and($.input("enabled", $.ref.kernel.types.Boolean, true)),
);

export type EnabledInputs = Expression.Inputs<
  Result.Result.Success<typeof enabled>
>;
// { readonly count: Type.PrimitiveInteger; readonly enabled?: Type.PrimitiveBoolean }
```

`Expression.Inputs<E>` extracts the record from an expression and `Program.Inputs<P>` from a program. The record follows these rules:

- An input with a default is optional for the host. The default's own requirements join the record.
- Calls, projections, indexing, value operations, filters, conditionals and blocks combine the requirements of their parts.
- Uses of one name intersect their types, and a required use makes the name required. Uses with incompatible primitive types produce `Type.Never` for that name instead of an error at the use site. Give inputs of different types different names.
- A conditional requires the inputs of its condition and both branches, because the record describes the constructed syntax rather than predicting which branch runs.
- A reference to a `Let` binding requires the inputs of its initializer.

A type annotation can't hide a requirement. Annotating `nonzero` with an empty input record is a TypeScript error:

```ts
// Uses: nonzero from the previous example.
// @ts-expect-error The empty record has no room for `count`.
const hidden: Expression.Expression<Type.PrimitiveBoolean, Inputs.Empty> =
  nonzero;
```

Let TypeScript infer the type, or name the requirement with `Expression.Inputs<typeof nonzero>`. The record is a TypeScript type. The SDK adds no runtime validator for the values a host supplies.

### Discarded host expressions and unused bindings

Only syntax that ends up in the tree counts. An expression you construct in JavaScript and then drop contributes nothing, while an unused `Let` binding is still emitted with its initializer.

```ts
// Uses: Do.
const discarded = Do(($) => {
  // JavaScript drops this handle, so the program never contains it.
  $.input("ignored", $.ref.kernel.types.Integer);
  return $.integer(1);
});
// Compiles to {"#literal":1} and requires no inputs.

const unused = Do(
  // Nothing refers to `unused`, but the `let` and its initializer are emitted.
  Let("unused", ($) => $.input("retained", $.ref.kernel.types.Integer)),
  ($) => $.integer(1),
);
// Compiles to a `let` whose initializer is the `retained` input, and requires `retained`.
```

The same holds for shadowed bindings: their initializers stay in the program and in the input record.

## Primitives and explicit assumptions

Where the SDK expects a value, you can often pass a host primitive. `$.literal` turns one into an expression explicitly. The host type decides the HashQL type:

| Host value | HashQL type |
| ---------- | ----------- |
| `number`   | `Number`    |
| `bigint`   | `Integer`   |
| `string`   | `String`    |
| `boolean`  | `Boolean`   |
| `null`     | `Null`      |

The type follows the host type, not the value. `1` stays a Number even though the serializer emits the same literal syntax for `1` and `1n`. Use `$.number(value)` to construct a Number explicitly, or `$.integer(value)` for a checked Integer that fails construction for a fractional value. A non-finite number fails construction wherever you pass it. `undefined` and symbols are not HashQL values.

Host primitives work as function arguments, `$index` keys, input defaults, operands of `.$` operations, `$.if` conditions and branch results, and filter predicate results. They contribute no input requirements. The callbacks of `Do`, `Let` and `Expr` must return an expression handle, so lift a host value there with `$.literal`, `$.integer` or `$.number`.

### Exact matching

The SDK compares types exactly and doesn't model HashQL subtyping. A parameter declared as Number rejects an Integer expression and a `bigint`, and a parameter declared as `String | Null` rejects a String expression. When you know the wider type is correct, state it with `Expression.assume` or `$.assume`:

```ts
// Uses: kernel, math.
type NullableString = Type.Union<
  readonly [Type.PrimitiveString, Type.PrimitiveNull]
>;

const root = math.values.sqrt(2);
// @ts-expect-error Integer doesn't widen to Number in the SDK.
math.values.sqrt(2n);

const two = Expression.assume<Type.PrimitiveNumber>()(Expression.integer(2));
const rootOfTwo = math.values.sqrt(two);

const name = Expression.input("name", kernel.types.String);
const nullable = Expression.assume<NullableString>()(name);
// Expression.Expression<NullableString, { readonly name: Type.PrimitiveString }>
```

An assumption changes only the TypeScript type. It emits no conversion and no HashQL type assertion, and `two` serializes exactly as `Expression.integer(2)` does. It preserves input requirements: `nullable` still requires `name`, and that input keeps its declared String type. An assumption doesn't prove anything either. The compiler still checks the program.

### Conditions

A `$.if` condition is a Boolean expression or a host `boolean`. Write `$.if(true, thenCallback, elseCallback)` rather than wrapping the constant in `$.literal`. An Integer or other non-Boolean expression is a TypeScript error as a condition. Outside a block, the top-level `If(condition, { then, else })` builds the same conditional from branches you have already constructed.

## Local scopes and host versus HashQL evaluation

Your TypeScript runs when it constructs the program. The HashQL it builds runs later, when the host executes the query. Most mistakes in this area come from mixing up the two.

### Local bindings

A nested block introduces bindings visible only inside it. Here `inner` exists in the first branch alone:

```ts
// Uses: math, Do.
const scoped = Do(
  Let("outer", ($) => $.integer(7)),
  ($, { outer }) =>
    $.if(
      true,
      () =>
        $.Let("inner", () => math.values.add(outer, 2n)).Expr(
          (_, { inner }) => inner,
        ),
      () => outer,
    ),
);
```

The branch emits its own `let`, nested inside the conditional. A nested block inherits the enclosing environments, and its declarations stay local. TypeScript types each callback's environments, so naming `inner` in the other branch is a TypeScript error.

### What a handle refers to

An expression handle holds a piece of syntax, its HashQL type and its input record. Some handles refer to names. A `Let` binding, an imported value and a `Newtype` constructor are local identifiers. A module declaration reached through the prelude is an absolute path such as `::core::math::add`. Other handles are composite syntax: literals, inputs, calls, projections, conditionals and nested blocks.

The SDK doesn't resolve names. The compiler resolves them, checks that each local identifier sits inside the expression that binds it, and type-checks the program. JavaScript can carry a handle for a local identifier out of the block that binds it, and TypeScript accepts the result:

```ts
// Uses: Do.
let escaped = Expression.integer(0);
Do(
  Let("local", ($) => $.integer(1)),
  (_, { local }) => {
    escaped = local;
    return local;
  },
);
const outside = Do(() => escaped);
```

`outside` constructs and type-checks, but the program it emits refers to `local` outside the `let` that binds it. Rejecting that program is the compiler's job. Take handles from the callback arguments of the block that uses them.

### Host decisions and HashQL decisions

A JavaScript `if`, ternary or loop runs during construction and decides what syntax to build. `$.if` builds a HashQL conditional, which decides at query time. A JavaScript `if` on a handle tests the handle object, which is always truthy, not the Boolean it represents.

```ts
// Uses: Do.
const target = 3 * 10;

const message = (verbose: boolean) =>
  Do(($) => {
    const count = $.input("count", $.ref.kernel.types.Integer);
    // JavaScript picks one literal now, while it builds the program.
    const detail = verbose ? "count equals the target" : "equal";
    // HashQL compares `count` with 30 when the query runs.
    return $.if(
      count.$.eq(BigInt(target)),
      () => detail,
      () => "different",
    );
  });
```

`target`, `verbose` and `detail` are host values, so the emitted program contains only their results. `message(true)` and `message(false)` build two different programs.

### Construction order and failures

The SDK calls your callbacks during construction, in step order. A few details follow from that:

- The SDK constructs both branches of a `$.if`, even though HashQL evaluates only one of them. A construction failure in either branch fails the whole conditional.
- A failed step skips the later callbacks of its block. A failing `Let` in a nested block skips the steps after it, and an invalid filter parameter name skips that filter's predicate.
- Expected construction failures arrive as a failed `Result`. An exception your own callback throws isn't converted. It propagates out of `Do` unchanged.

Don't rely on a callback running for its side effects.

## Construction errors

Expected construction failures arrive as a `Result` holding a `ProgramError.Construction`. Its `_tag` is `"ProgramConstructionError"`, and its `reason` says what went wrong:

```ts
// Uses: the shared imports.
const invalid = EmptyDo(
  Let("not a name", ($) => $.integer(1)),
  ($) => $.integer(2),
);

if (Result.isFailure(invalid)) {
  const error = invalid.failure;
  console.log(error.reason._tag); // "InvalidBindingName"
  console.log(error.message); // Invalid HashQL binding name: "not a name"
}
```

The reasons are:

| Reason                                                                                 | Cause                                                                                       |
| -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `InvalidBindingName`, `InvalidImportName`, `InvalidParameterName`, `InvalidExportName` | A name isn't a valid HashQL identifier                                                      |
| `InvalidModulePath`, `RelativeModulePath`                                              | A module path is invalid or not absolute                                                    |
| `InvalidTypeArity`, `TypeArgumentCount`                                                | A type constructor has an invalid arity or wrong number of arguments                        |
| `InvalidExpression`                                                                    | Syntax isn't valid J-Expr, including non-finite numbers                                     |
| `InvalidBlock`                                                                         | A block's steps are out of shape, or a callback returned something other than an expression |

Reasons that come from parsing a name or syntax carry the parser's error as `cause`. The output quotes a binding name that needs quoting, such as `%`, rather than rejecting it.

## Constructing from raw syntax

`Expression.fromJExpr<T, Inputs>(syntax)` wraps raw J-Expr as an expression. It validates the syntax's structure and trusts both type arguments. `TypeExpression.fromType<T>(syntax)` does the same for type syntax. The `JExpr` namespace holds builders and a serializer for raw syntax.

Raw syntax has no input record, so these constructors take the requirements on trust. Use `Inputs.Empty` only for syntax that contains no inputs, and state every input the syntax contains. To change an expression's type, use `Expression.assume`. It keeps the requirements automatically. A raw-syntax round trip requires you to supply them again; using `Inputs.Empty` loses them:

```ts
// Uses: kernel.
const counted = Expression.input("count", kernel.types.Integer);

// Drops the `count` requirement: the raw syntax still contains the input.
const dropped = Expression.fromJExpr<Type.PrimitiveInteger, Inputs.Empty>(
  Result.getOrThrow(Expression.toJExpr(counted)),
);

// Keeps it.
const kept = Expression.assume<Type.PrimitiveInteger>()(counted);
```

`Expression.toJExpr` returns an expression's J-Expr as a `Result`. `Expression.toNode` returns its syntax tree as a `Result`. `Program.compile` returns a `Result` containing the serialized program.

## Authoring rules

Follow these rules when you write HashQL with the SDK, whether by hand or as a coding agent.

1. Use the SDK when you want typed composition. Describe each module the program uses with `Module.define`, with types taken from the real HashQL definitions.
2. Use only API that the package exports, as this guide shows it. Don't invent methods, helpers or overloads. `JExpr` provides raw struct and list builders, but the high-level expression API currently offers neither typed equivalents nor unchecked accessors.
3. Refer to declarations through handles from callback environments, `Import` and `$.ref`. A string is always a literal.
4. Return an expression handle from every `Do`, `Let` and `Expr` callback. Lift host values with `$.literal`, `$.integer` or `$.number`.
5. Declare one name per `Let`, `Type` or `Newtype` step. Records that list declarations belong in `Module.define`.
6. Handle every `Result`. Yield inside `Result.gen` in application code. Callback exceptions propagate unchanged rather than becoming construction Results.
7. Preserve input requirements. Let TypeScript infer handle types, use `assume` rather than raw syntax round trips, and state every input when you wrap raw syntax with `Expression.fromJExpr`.
8. Don't treat TypeScript annotations or `assume` as compiler validation. A program that type-checks still needs the HashQL compiler.
9. Keep references in their HashQL lexical scope. Take each handle from the callback arguments of the block that uses it, and don't store local bindings in outer variables.
10. Chain `filter` and `collect` before binding a query. Bind the collected result or the values the query depends on.
11. Use `$.if` for decisions the query makes and JavaScript control flow for decisions you make while building it.
12. Match types exactly. A `number` produces a Number and a `bigint` produces an Integer. State a wider type with `assume` when you know it is correct.
13. Give each `Newtype` its own `unique symbol`.
