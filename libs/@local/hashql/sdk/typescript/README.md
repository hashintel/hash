# HashQL SDK

The SDK constructs HashQL query syntax. TypeScript checks the authoring API. The HashQL compiler resolves names and checks the emitted program. `JExpr` provides the low-level expression builders and serializer. Construction does not execute the query.

Import shared types, expressions, `Prelude` and `Program` from `@local/hashql`. Import Do authoring calls from `@local/hashql/do`, or the executed Draft builder from `@local/hashql/draft`. Both produce expressions that the shared `program` constructor wraps.

Start with the [authoring guide](docs/authoring.md). It provides a complete construction example, focused API examples and rules for developers and coding agents.

## Draft authoring

Draft executes one synchronous callback. Declarations accumulate around the returned expression, and the explicit input schema supplies the whole program's input contract, including unused entries and discarded declaration initializers.

```ts
import { Result } from "effect";
import { Prelude, Program } from "@local/hashql";
import { program } from "@local/hashql/draft";

const identity = Symbol("Count");
const built = program({ count: Prelude.builtin.types.Integer }, ($, inputs) => {
  const Count = $.newtype("Count", identity, BigInt);
  const value = $.let("value", Count(inputs.count));
  return $.ifElse(
    true,
    () => value,
    () => Count(0n),
  );
});
const compiled = Result.flatMap(built, (expression) =>
  Program.compile(Program.program(expression)),
);
```

`$.type(name, definition)` accepts type expressions or structural shorthand. `$.newtype(name, uniqueSymbol, definition)` returns a type and callable nominal constructor together; for example, `const identity = Symbol("Foo"); const Foo = $.newtype("Foo", identity, { foo: BigInt }); Foo({ foo: 2n })`. Records describe structs, arrays describe tuples, and `List(BigInt)` and `Dict(String, BigInt)` describe collections. `number` remains Number, while `bigint` is Integer.

`$.ifElse(condition, thenCallback, elseCallback)` supplies each branch its own context. The direct `{ then, else }` form accepts already-built values. Both callbacks construct syntax. HashQL chooses the runtime branch. Use the predicate context for declarations inside a filter. Capturing an outer context can place a declaration outside the vertex's scope. HashQL performs lexical resolution and rejects free references.

Draft's default prelude contains primitive types, List/Dict, Uuid, EntityUuid, `eq` and `add`. It demonstrates declaration-table composition rather than mirroring the complete standard library. Draft's `withPrelude(definition)` returns `{ program }` and replaces these defaults. A custom `entities` declaration supplies the query entry point. The default has none. Do's default remains empty. See the [Draft reference](docs/authoring.md#draft-executed-authoring) for coverage and source definitions.

Construction failures are Results. Synchronous user exceptions propagate unchanged. TypeScript rejects async callbacks. Draft continues executing a synchronous callback after a declaration fails and reports the accumulated failure at its end.

## Do authoring

Do authoring uses separate module, value and type environments. A value and a type can have the same name. Each step receives `$` plus the environments it needs:

| Step             | Callback arguments | Introduces                                       |
| ---------------- | ------------------ | ------------------------------------------------ |
| `Let`            | `$`, values, types | One value binding                                |
| `Type`           | `$`, types         | One type alias                                   |
| `Newtype`        | `$`, types         | A nominal type and its constructor               |
| `Import`         | `$`, modules       | Selected exports in every applicable environment |
| Final expression | `$`, values, types | The block's result                               |

`$` supplies literals, typed inputs, conditionals and query helpers. Its `ref` property holds the current module declarations. For example, `$.ref.math.values.cmp` accesses a declared value without importing its name locally.

```ts
import { Result } from "effect";
import { Module, Program, program } from "@local/hashql";
import { withPrelude } from "@local/hashql/do";
import type { Type as Semantic } from "@local/hashql";

const userId: unique symbol = Symbol("UserId");
const query = Result.gen(function* () {
  const kernel = yield* Module.define("::kernel::type", {
    types: { Integer: Module.type<Semantic.PrimitiveInteger>() },
  });

  const { Do, Let, Type, Newtype, Import } = withPrelude({
    modules: { kernel },
  });

  const expression = yield* Do(
    Import((_, { kernel }) => kernel),
    Type("Count", (_, { Integer }) => Integer),
    Newtype("UserId", userId, (_, { Count }) => Count),
    Let("id", (_, { UserId }) => UserId(7n)),
    ($, { id }, { UserId }) => $.input("id", UserId, id),
  );

  return yield* Program.compile(program(expression));
});
```

`query` is a `Result<string, ProgramError.Construction>`. `Do` returns its result after the final expression callback. Declaration steps and nested expressions retain failures internally, allowing composition without unwrapping each expression. A failed declaration skips later callbacks. Host callback exceptions propagate unchanged rather than becoming construction errors.

`ProgramError.Construction` has the tag `ProgramConstructionError` and a tagged `reason`. Reasons identify invalid names, module paths, type arities, argument counts, expression syntax and malformed blocks. Parser-backed reasons retain their underlying `cause` without exposing the parser's error type in the program API.

`Let` introduces one sequential binding. Later steps see a reference to that binding. Declarations wrap their bodies in HashQL special forms, not closures. Bindings retain their authored names, with identifier quoting where required. Later declarations shadow names only in their own environments.

`Type` preserves the underlying semantic type. `Newtype` produces a distinct `Semantic.Opaque` type. Its unique symbol supplies TypeScript's nominal identity and is not serialized. Use a distinct symbol for each distinct declaration, including declarations with the same HashQL name. These builders currently define concrete types, not parameterized local declarations.

## Imports

`Import` emits a HashQL `use` expression and introduces local references. `Import((_, { math }) => math)` imports every exported name. A second argument selects names, such as `["cmp"]`, or renames them, such as `{ cmp: "compare" }`. An alias of `"_"` retains the original name. Each selected name enters every environment in which the module exports it, including a same-named type and constructor. Imported child modules expose references beneath their local module name.

`Do` from `@local/hashql/do` starts with empty environments. `withPrelude` from the same subpath accepts optional `modules`, `values` and `types` records without emitting imports. The positional `Do` overloads support up to eight declaration steps and a final expression. Chained nested blocks have no fixed step count.

## Conditional blocks

Each branch of `$.if` returns an expression. A branch needing declarations uses the scope-bound step methods and ends with `Expr`:

```ts
import { Result } from "effect";
import { Program, program } from "@local/hashql";
import { Do, Let } from "@local/hashql/do";

const conditional = Do(
  Let("outer", ($) => $.integer(7)),
  ($, { outer }) =>
    $.if(
      true,
      () => $.Let("inner", () => outer).Expr((_, { inner }) => inner),
      () => outer,
    ),
);

const compiled = Result.flatMap(conditional, (expression) =>
  Program.compile(program(expression)),
);
```

Branches inherit the enclosing environments, but their declarations remain local. Both callbacks run during construction, and a failure in either branch fails the containing expression. HashQL chooses which branch to evaluate when executing the query. Native JavaScript `if` tests an expression handle's truthiness, not the represented Boolean value.

## Declarations and expressions

`Module.define` binds declarations to absolute HashQL paths and returns a `Result`. Its `modules`, `types` and `values` records remain separate. Copying an existing export into another declaration preserves its original reference. `Module.root` assembles an existing module tree and also returns a `Result`. Both operations copy and freeze their export records.

`Module.value<T>` declares a value, `Module.type<T>` declares a concrete type, and `Module.genericType<Lambda>` declares a parameterized type. Declarations supply trusted semantic annotations. Neither `Expression.fromJExpr<T, Inputs>` nor `TypeExpression.fromType<T>` proves that arbitrary syntax has type `T`. `Expression.fromJExpr` also trusts the supplied input requirements. Use `Inputs.Empty` for syntax without inputs. Generated declarations must obtain that information from their source.

The package does not include a generated standard-library bundle.

Type applications preserve the declared semantic result and retain construction failures. `TypeExpression.toType` returns the underlying type syntax as a `Result`. A type expression is not itself raw `JExpr.Type` syntax.

Expression handles support typed projections, `$project`, `$index` and function calls. Direct `then` access returns `undefined` to prevent Promise assimilation. Use `$project("then")` for that field. Generic function declarations use `Semantic.GenericFunction<Signature>` with a `Semantic.FunctionSignature` mapping argument descriptors to a function signature.

`$.literal` accepts JavaScript primitives other than `undefined` and symbols. A `number` produces `Semantic.PrimitiveNumber`, and a `bigint` produces `Semantic.PrimitiveInteger`. This distinction follows the host type, not the value: `1` remains Number even when the serializer emits integer literal syntax. Use `$.number` to construct Number explicitly or `$.integer` for checked integer construction. Non-finite numbers produce construction failures.

Compatible primitives also work as function arguments, index keys, input defaults, comparison and Boolean operands, conditional conditions and branches, and query predicate results. Strings always denote literals, not references. Primitives contribute no input requirements. Arrays, objects and block bodies still need explicit expression construction.

`$.input(name, type, defaultValue?)` selects its default only when the host omits the input. The SDK checks matching semantic descriptors rather than general HashQL subtyping. A Number parameter rejects Integer handles and bigints. `$.assume<T>()(expression)` changes the SDK annotation while preserving input requirements. It emits no conversion or HashQL type assertion, and does not prove the new annotation.

Value operations live under `expression.$`: `eq`, `ne`, Boolean `and`, `or`, `isTrue`, `isFalse`, and optional-value `isNone`. Query operations chain directly through `$.query.entities(now()).filter("vertex", predicate).collect()`. The `entities` declaration in the value environment determines the query's argument and vertex types. A filter emits a closure with the supplied parameter name. A query stored in a `Let` binding loses its query-chain methods intentionally, matching a compiler restriction. Complete the chain before binding its collected result.

## Reusable expressions and inputs

`Expression.Expression<T, Inputs>` carries its semantic result type and a record of input descriptors. Composition combines those records through calls, projections, indexing, value operations, filters and blocks. `Expression.Inputs<typeof expression>` extracts the record. `Program.Inputs<typeof program>` extracts it from a program.

```ts
import { Result } from "effect";
import { Expression, Module, Program } from "@local/hashql";
import { Do } from "@local/hashql/do";
import type { Type } from "@local/hashql";

const query = Result.gen(function* () {
  const kernel = yield* Module.define("::kernel::type", {
    types: {
      Integer: Module.type<Type.PrimitiveInteger>(),
      Boolean: Module.type<Type.PrimitiveBoolean>(),
    },
  });

  const count = Expression.input("count", kernel.types.Integer);

  const nonzero = count.$.ne(0n);

  const expression = yield* Do(($) =>
    nonzero.$.and($.input("enabled", kernel.types.Boolean, true)),
  );

  return Program.program(expression);
});

export type Inputs = Program.Inputs<Result.Result.Success<typeof query>>;
// { readonly count: Type.PrimitiveInteger; readonly enabled?: Type.PrimitiveBoolean }
```

The saved `nonzero` expression can participate in other programs with its `count` requirement intact. A default makes its input optional. Combining uses of the same name intersects their semantic types, and any required use makes the name required. Incompatible primitive types produce `Type.Never` in that record. This describes the requirements without adding a runtime SDK validator.

Requirements include both conditional branches, defaults' own dependencies and every emitted `Let` initializer, including shadowed or unused bindings. They describe the constructed syntax conservatively rather than predicting which branches will execute. An expression constructed and discarded in JavaScript contributes nothing. References to local HashQL bindings retain their lexical scope requirements.

## Syntax trees and examples

Serialization traverses the constructed tree rather than rerunning authoring callbacks. `Let`, `Type`, `Newtype` and `Import` nodes own their child. `If` owns its condition and both branches. Every completed node implements `compile(): JExpr.Expression` without an external scope or child.

`Expression.toNode` returns the handle's tree as a `Result`. `Expression.toJExpr` compiles it to J-Expr, and `Program.compile` also serializes it. A saved JavaScript handle still depends on the lexical scope of the HashQL name it references. The compiler owns name resolution, capture analysis and free-reference validation.

The [authoring guide](docs/authoring.md) is the tutorial and API reference. The [checked examples](examples/api-tour.test-d.ts) retain exact-type assertions and `@ts-expect-error` cases in the package checks. These checks validate the SDK, not HashQL compiler acceptance or graph execution.

[`examples/filters.ts`](examples/filters.ts) compares existing J-Expr queries and frontend selection predicates with Do constructions. [`examples/filters-draft.ts`](examples/filters-draft.ts) writes the same queries with Draft, using explicit schemas, local bindings and predicate callbacks. Both use the same [module declarations](examples/filters-declarations.ts). Start at `allEntities` in either file. These examples construct syntax without frontend integration or a graph connection. Their static module fixtures unwrap declaration results explicitly.

Run the package checks with `yarn workspace @local/hashql test:unit`, `lint:tsc`, `lint:oxlint` and `build`.
