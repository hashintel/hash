import { identity } from "effect";

import type { Node as AstNode } from "../ast/Node.js";
import type * as ProgramError from "../ProgramError.js";
import type { Utilities } from "../Utilities.js";
import type { Scope } from "./Scope.js";
import type { Result, Types } from "effect";

export interface Variance<In, Out> {
  readonly _In: Types.Invariant<In>;
  readonly _Out: Types.Invariant<Out>;
}

export const TypeId = "~hashql/program/ir/Node";

export interface Transition<Out extends Scope> {
  readonly scope: Out;
  readonly wrap: (child: AstNode) => AstNode;
}

/** Runtime construction with erased scope parameters. */
export interface Any {
  readonly elaborate: (
    utilities: Utilities<Scope>,
    scope: Scope,
  ) => Result.Result<Transition<Scope>, ProgramError.Construction>;
}

/** A construction step with independent input and output types for each universe. */
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
