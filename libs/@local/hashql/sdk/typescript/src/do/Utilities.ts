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

export type Body<S extends Scope.Scope, T extends Type.Any, Inputs> = (
  utilities: Utilities<S>,
  values: S["values"],
  types: S["types"],
) => Expression.Expression<T, Inputs>;

type Wrap = Node.Transition<Scope.Scope>["wrap"];

export type BuildStep = Node.Any | Body<Scope.Scope, Type.Any, never>;

/** An unfinished nested block must end with an expression. */
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

export interface Utilities<S extends Scope.Scope>
  extends Block<S, Input.Empty>, Operators.Operations {
  readonly literal: typeof Expression.literal;
  readonly integer: typeof Expression.integer;
  readonly number: typeof Expression.number;
  readonly input: typeof Expression.input;
  readonly assume: typeof Expression.assume;
  readonly ref: S["modules"];
  readonly query: Query.Context<S>;
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
