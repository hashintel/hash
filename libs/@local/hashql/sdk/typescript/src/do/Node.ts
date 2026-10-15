import { identity } from "effect";

import type { Node as AstNode } from "../program/ast/Node.js";
import type * as ProgramError from "../program/ProgramError.js";
import type { Scope } from "../program/Scope.js";
import type { Utilities } from "./Utilities.js";
import type { Result, Types } from "effect";

/** Invariant markers for one environment's scope before and after a declaration step. */
export interface Variance<In, Out> {
  readonly _In: Types.Invariant<In>;
  readonly _Out: Types.Invariant<Out>;
}

/**
 * The property key that marks a value as a declaration step.
 *
 * `Do` fails with `InvalidBlockStep` when a value in a step position is neither a callback nor marked with this key.
 */
export const TypeId = "~hashql/do/Node";

/** The outcome of elaborating a declaration step: the scope later steps see and the wrapper that emits the declaration. */
export interface Transition<Out extends Scope> {
  /** The scope after the declaration, which the following steps and the body receive. */
  readonly scope: Out;
  /** Places the declaration around `child`, the syntax of everything that follows it in the block. */
  readonly wrap: (child: AstNode) => AstNode;
}

/** A declaration step with its scope parameters erased, as a block's runtime driver handles it. */
export interface Any {
  /**
   * Runs the step's callback against the current scope and returns the declaration's transition or construction failure.
   *
   * A block calls it while constructing, once per step, after the preceding steps succeed. The block converts an exception thrown here into a `CallbackException` failure.
   */
  readonly elaborate: (
    utilities: Utilities<Scope>,
    scope: Scope,
  ) => Result.Result<Transition<Scope>, ProgramError.Construction>;
}

/**
 * A typed declaration step from the scope `In` to the scope `Out`, contributing the input requirements `Inputs`.
 *
 * `Let`, `Type`, `Newtype` and `Import` construct steps. Creating one runs none of its callbacks: a block runs the callback each time it elaborates the step. The marker property records each environment's scope before and after the step, which lets the Do overloads infer the scope of every later step.
 */
export interface Node<In extends Scope, Out extends Scope, Inputs> extends Any {
  readonly [TypeId]: {
    readonly inputs: Types.Contravariant<Inputs>;
    readonly modules: Variance<In["modules"], Out["modules"]>;
    readonly values: Variance<In["values"], Out["values"]>;
    readonly types: Variance<In["types"], Out["types"]>;
  };
}

export const make = <In extends Scope, Out extends Scope, Inputs>(
  elaborate: (
    utilities: Utilities<In>,
    scope: In,
  ) => Result.Result<Transition<Out>, ProgramError.Construction>,
): Node<In, Out, Inputs> => {
  // oxlint-disable-next-line typescript/no-restricted-types -- this is the heterogeneous driver boundary
  const erased: unknown = elaborate;
  return {
    [TypeId]: {
      // oxlint-disable-next-line typescript/strict-void-return -- only used for variance
      inputs: identity,
      modules: { _In: identity, _Out: identity },
      values: { _In: identity, _Out: identity },
      types: { _In: identity, _Out: identity },
    },
    // SAFETY: block composition supplies exactly the input scope recorded in the node's type.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- only the runtime driver erases the successive scopes
    elaborate: erased as Any["elaborate"],
  };
};
