/**
 * Sequential declaration blocks for the Do authoring API.
 *
 * Each step extends the typed scope and records how to wrap the final expression. Nested bodies inherit the scope without repeating the declarations that introduced it. {@link Block} retains construction failures until the caller completes the body.
 *
 * @module
 */
// oxlint-disable import/max-dependencies -- block construction composes the declaration steps and expression helpers
// oxlint-disable unicorn/no-array-method-this-argument -- Result.map and Result.flatMap are not array methods
import { Cause, Result, identity, pipe } from "effect";

import { If as AstIf } from "../program/ast/If.js";
import * as Expression from "../program/Expression.js";
import * as Operators from "../program/Operators.js";
import * as ProgramError from "../program/ProgramError.js";
import * as Query from "../program/Query.js";
import { Import } from "./Import.js";
import { Let } from "./Let.js";
import { Newtype } from "./Newtype.js";
import * as Node from "./Node.js";
import { Type as DeclareType } from "./Type.js";

import type { Node as AstNode } from "../program/ast/Node.js";
import type { Rebindable } from "../program/Import.js";
import type * as Input from "../program/Inputs.js";
import type * as Scope from "../program/Scope.js";
import type { TypeExpression } from "../program/TypeExpression.js";
import type * as Type from "../type/index.js";
import type { Imported, Selection } from "./Import.js";
import type { Exports } from "./Newtype.js";
import type { ReadonlyRecord } from "effect/Record";

/**
 * A callback that returns an expression from the utilities, values and types of the scope `S`.
 *
 * It types a block's final body and the initializer of a nested `Let`. As a final body, it must return an expression handle: any other value fails construction with `InvalidBodyResult`, so lift a host primitive with `$.literal`, `$.integer` or `$.number`.
 */
export type Body<S extends Scope.Scope, T extends Type.Any, Inputs> = (
  utilities: Utilities<S>,
  values: S["values"],
  types: S["types"],
) => Expression.Expression<T, Inputs>;

type Wrap = Node.Transition<Scope.Scope>["wrap"];

export type BuildStep = Node.Any | Body<Scope.Scope, Type.Any, never>;

/**
 * A nested Do block under construction, started from a callback's `$`.
 *
 * `Let`, `Type`, `Newtype` and `Import` each elaborate one declaration immediately: they run the step's callback with the block's current scope and return a block whose scope includes the declaration. Once a step fails, later methods skip their callbacks and keep that failure. {@link Block.Expr} ends the chain with a body and returns the block's expression, which wraps the body in the block's declarations. Those declarations stay inside that expression, and the enclosing callback's scope does not gain them.
 *
 * A failure, including an exception thrown by one of the callbacks, does not interrupt the enclosing callback. It stays attached to the returned expression and fails construction of any program that contains it.
 */
export class Block<S extends Scope.Scope, Inputs> {
  readonly #state: Result.Result<
    {
      readonly scope: S;
      readonly parents: readonly Wrap[];
    },
    ProgramError.Construction
  >;

  constructor(
    state: Result.Result<
      { readonly scope: S; readonly parents: readonly Wrap[] },
      ProgramError.Construction
    >,
  ) {
    this.#state = state;
  }

  #append(step: Node.Any): Block<Scope.Scope, never> {
    return new Block(
      Result.flatMap(this.#state, ({ scope, parents }) => {
        const input: Scope.Scope = scope;
        return pipe(
          Result.try({
            // oxlint-disable-next-line eslint/no-use-before-define -- block steps receive utilities that can create further blocks
            try: () => step.elaborate(makeUtilities(input), input),
            catch: (error) =>
              ProgramError.Construction.callbackException(
                new Cause.UnknownError(error),
              ),
          }),
          Result.flatMap(identity),
          Result.map(({ scope, wrap }) => ({
            scope,
            parents: [...parents, wrap],
          })),
        );
      }),
    );
  }

  #step<Out extends Scope.Scope, AddedInputs>(
    step: Node.Node<S, Out, AddedInputs>,
  ): Block<Out, Input.Merge<Inputs, AddedInputs>> {
    // oxlint-disable-next-line typescript/no-restricted-types -- this is the heterogeneous driver boundary
    const output: unknown = this.#append(step);

    // SAFETY: elaborating this node produces its declared output scope.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- restores the output scope erased by the shared driver
    return output as Block<Out, Input.Merge<Inputs, AddedInputs>>;
  }

  /** Appends a value binding, as the `Let` step does, running `initializer` now unless an earlier step failed. */
  Let<const Name extends string, T extends Type.Any, AddedInputs>(
    name: Name,
    initializer: Body<S, T, AddedInputs>,
  ): Block<
    Scope.Merge<
      S,
      { values: ReadonlyRecord<Name, Expression.Expression<T, AddedInputs>> }
    >,
    Input.Merge<Inputs, AddedInputs>
  > {
    return this.#step(Let(name, initializer));
  }

  /** Appends a type alias, as the `Type` step does, running `definition` now unless an earlier step failed. */
  Type<const Name extends string, T extends Type.Any>(
    name: Name,
    definition: (
      utilities: Utilities<S>,
      types: S["types"],
    ) => TypeExpression<T>,
  ): Block<
    Scope.Merge<S, { types: ReadonlyRecord<Name, TypeExpression<T>> }>,
    Inputs
  > {
    return this.#step(DeclareType(name, definition));
  }

  /** Appends a nominal type and its constructor, as the `Newtype` step does, running `definition` now unless an earlier step failed. */
  Newtype<
    const Name extends string,
    const Identity extends symbol,
    T extends Type.Any,
  >(
    name: Name,
    identity: Identity & (symbol extends Identity ? never : Identity),
    definition: (
      utilities: Utilities<S>,
      types: S["types"],
    ) => TypeExpression<T>,
  ): Block<Scope.Merge<S, Exports<Name, Identity, T>>, Inputs> {
    return this.#step(
      Newtype<S, Name, Identity, T>(name, identity, definition),
    );
  }

  /** Appends an import of the module `select` returns, as the `Import` step does, running `select` now unless an earlier step failed. */
  Import<M extends NonNullable<Scope.Scope["modules"][string]>>(
    select: (
      utilities: Utilities<S>,
      modules: S["modules"],
    ) => M & Rebindable<M>,
  ): Block<Scope.Merge<S, Imported<M, "*">>, Inputs>;
  Import<
    M extends NonNullable<Scope.Scope["modules"][string]>,
    const Imports extends Selection<M>,
  >(
    select: (
      utilities: Utilities<S>,
      modules: S["modules"],
    ) => M & Rebindable<M>,
    imports: Imports,
  ): Block<Scope.Merge<S, Imported<M, Imports>>, Inputs>;
  Import<
    M extends NonNullable<Scope.Scope["modules"][string]>,
    const Imports extends Selection<M>,
  >(
    select: (
      utilities: Utilities<S>,
      modules: S["modules"],
    ) => M & Rebindable<M>,
    imports?: Imports,
  ):
    | Block<Scope.Merge<S, Imported<M, "*">>, Inputs>
    | Block<Scope.Merge<S, Imported<M, Imports>>, Inputs> {
    if (imports === undefined) {
      return this.#step(Import<S, M>(select));
    }

    return this.#step(Import<S, M, Imports>(select, imports));
  }

  /**
   * Ends the block with its body and returns the block's expression.
   *
   * The body runs now with the block's scope, unless an earlier step failed. The returned expression wraps the body's expression in this block's declarations, in step order, and combines the input requirements of every step with the body's. It is an expression rather than a `Result`, and it carries any construction failure, including one from a callback's exception.
   */
  Expr<T extends Type.Any, BodyInputs>(
    body: Body<S, T, BodyInputs>,
  ): Expression.Expression<T, Input.Merge<Inputs, BodyInputs>> {
    return Expression.fromResult(
      Result.flatMap(this.#state, ({ scope, parents }) => {
        // A nested block inherits names, never the wrappers that introduced them outside it.
        const evaluated = Result.try({
          try: () =>
            body(
              // oxlint-disable-next-line eslint/no-use-before-define -- block bodies receive utilities that can create further blocks
              makeUtilities(scope),
              scope.values,
              scope.types,
            ),
          catch: (error) =>
            ProgramError.Construction.callbackException(
              new Cause.UnknownError(error),
            ),
        });

        if (Result.isFailure(evaluated)) {
          return Result.fail(evaluated.failure);
        }

        const expression = evaluated.success;
        if (!Expression.isExpression(expression)) {
          return Result.fail(ProgramError.Construction.invalidBodyResult());
        }
        return Result.map(Expression.toNode(expression), (node) => {
          let root = node;
          for (const wrap of parents.toReversed()) {
            root = wrap(root);
          }
          return root;
        });
      }),
    );
  }

  static build(
    scope: Scope.Scope,
    steps: readonly BuildStep[],
  ): Result.Result<Expression.Any, ProgramError.Construction> {
    let block = new Block<Scope.Scope, never>(
      Result.succeed({ scope, parents: [] }),
    );
    const body = steps.at(-1);
    if (typeof body !== "function" || Expression.isExpression(body)) {
      return Result.fail(ProgramError.Construction.missingBlockBody());
    }

    for (const step of steps.slice(0, -1)) {
      if (typeof step === "function") {
        return Result.fail(ProgramError.Construction.misplacedBlockBody());
      }

      if (
        typeof step !== "object" ||
        // oxlint-disable-next-line typescript/no-unnecessary-condition -- JavaScript callers may pass null despite the overloads
        step === null ||
        !(Node.TypeId in step)
      ) {
        return Result.fail(ProgramError.Construction.invalidBlockStep());
      }
      block = block.#append(step);
    }

    const expression = block.Expr(body);
    return Result.map(Expression.toNode(expression), () => expression);
  }
}

const evaluateBranch = (
  body: () => Expression.AnyValue,
): Result.Result<AstNode, ProgramError.Construction> =>
  pipe(
    Result.try({
      try: body,
      catch: (error) =>
        ProgramError.Construction.callbackException(
          new Cause.UnknownError(error),
        ),
    }),
    Result.flatMap(Expression.toNode),
  );

/** Constructs a HashQL conditional, running both branch callbacks during construction. */
const conditional = <
  const Condition extends Expression.Value<Type.PrimitiveBoolean>,
  const Then extends Expression.AnyValue,
  const Else extends Expression.AnyValue,
>(
  condition: Condition,
  consequent: () => Then,
  alternate: () => Else,
): Expression.Expression<
  Expression.Conditional<Expression.TypeOf<Then>, Expression.TypeOf<Else>>,
  Input.Merge<
    Expression.Inputs<Condition>,
    Input.Merge<Expression.Inputs<Then>, Expression.Inputs<Else>>
  >
> =>
  pipe(
    {
      condition: Expression.toNode(condition),
      consequent: evaluateBranch(consequent),
      alternate: evaluateBranch(alternate),
    },
    Result.all,
    Result.map(
      (nodes) => new AstIf(nodes.condition, nodes.consequent, nodes.alternate),
    ),
    Expression.fromResult<
      Expression.Conditional<Expression.TypeOf<Then>, Expression.TypeOf<Else>>,
      Input.Merge<
        Expression.Inputs<Condition>,
        Input.Merge<Expression.Inputs<Then>, Expression.Inputs<Else>>
      >
    >,
  );

/**
 * The `$` argument of every Do callback: expression constructors and an empty nested block at the callback's scope.
 *
 * Because `$` is itself a {@link Block}, `$.Let`, `$.Type`, `$.Newtype`, `$.Import` and `$.Expr` start a nested block whose declarations stay inside the expression it returns. The predicate constructors `eq`, `ne`, `and`, `or`, `not`, `isTrue`, `isFalse` and `isNone` are the standalone `Operators` functions.
 */
export interface Utilities<S extends Scope.Scope>
  extends Block<S, Input.Empty>, Operators.Operations {
  /** Lifts a host primitive to an expression whose type follows the host type. This is `Expression.literal`. */
  readonly literal: typeof Expression.literal;
  /** Constructs an Integer literal, failing construction for a fractional or non-finite number. This is `Expression.integer`. */
  readonly integer: typeof Expression.integer;
  /** Constructs a Number literal. This is `Expression.number`. */
  readonly number: typeof Expression.number;
  /** References a program input, optionally with a default. This is `Expression.input`. */
  readonly input: typeof Expression.input;
  /** Changes an expression's semantic type assumption without validating that semantic type. This is `Expression.assume`. */
  readonly assume: typeof Expression.assume;
  /**
   * The modules visible at this point: the prelude's modules and those imported by earlier steps, under their local names.
   *
   * Reach a module's exports through its `modules`, `types` and `values` records, such as `$.ref.math.values.add`. A prelude module's exports refer to their declared paths, and an imported module's exports refer to their paths under its local name.
   */
  readonly ref: S["modules"];
  /**
   * Graph query entry points, present when the values environment holds a suitable `entities` function.
   *
   * `entities` exists when that function returns a `::graph::Graph` opaque type, whose vertex type the query's predicates receive. Each `filter` predicate runs during the `filter` call, unless the query already carries a failure or the parameter name is invalid. An exception it throws becomes a `CallbackException` failure on the query.
   */
  readonly query: Query.Context<S>;
  /**
   * Constructs a HashQL conditional from a Boolean condition and two branch callbacks.
   *
   * Both callbacks run immediately, then-branch first, whatever the condition's value: HashQL decides the condition when the query runs, so construction needs both branches. Each callback returns an expression or a host primitive and takes no arguments. Start a nested block from the enclosing `$` for declarations local to a branch.
   *
   * An exception thrown by a callback becomes a `CallbackException` failure on the returned expression and does not interrupt the enclosing callback. If more than one part fails, the expression carries the first failure in the order condition, then-branch, else-branch.
   *
   * @example <caption>Construct both branches, one with a local binding.</caption>
   * ```ts
   * import assert from "node:assert/strict";
   * import { Program } from "@local/hashql";
   * import { Do } from "@local/hashql/do";
   * import { Result } from "effect";
   *
   * const visited: string[] = [];
   * const result = Do(($) =>
   *   $.if(
   *     true,
   *     () => {
   *       visited.push("then");
   *       return $.Let("local", ($) => $.integer(1)).Expr((_, { local }) => local);
   *     },
   *     () => {
   *       visited.push("else");
   *       return $.integer(2);
   *     },
   *   ),
   * );
   * assert.deepEqual(visited, ["then", "else"]);
   * assert.equal(
   *   Result.getOrThrow(Result.flatMap(result, (root) => Program.compile(Program.program(root)))),
   *   '["::kernel::special_form::if",{"#literal":true},["::kernel::special_form::let","local",{"#literal":1},"local"],{"#literal":2}]',
   * );
   * ```
   */
  readonly if: typeof conditional;
}

const makeUtilities = <S extends Scope.Scope>(scope: S): Utilities<S> =>
  Object.assign(
    new Block<S, Input.Empty>(Result.succeed({ scope, parents: [] })),
    {
      ...Operators.operations,
      literal: Expression.literal,
      integer: Expression.integer,
      number: Expression.number,
      input: Expression.input,
      assume: Expression.assume,
      ref: scope.modules,
      query: Query.make(scope),
      if: conditional,
    },
  );
