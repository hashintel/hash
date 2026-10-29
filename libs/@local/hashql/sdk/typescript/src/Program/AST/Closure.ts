import { Array, Pipeable, Predicate, Record } from "effect";

import * as Referential from "../../internal/referential.js";
import * as Ident from "../../JExpr/Ident.js";
import * as JExpr from "../../JExpr/index.js";

import type { TypeNode } from "../TAST/TypeNode.js";
import type { Node } from "./Node.js";

/** A closure's type parameter, with the bound its arguments satisfy. An unbounded parameter's bound is the inferred type `_`. */
export interface GenericParameter {
  readonly id: Referential.ReferenceId<"type">;
  readonly bound: TypeNode.Any;
}

/** A closure's parameter, with its type. HashQL infers a type that is `_`. */
export interface ClosureParameter {
  readonly id: Referential.ReferenceId<"value">;
  readonly type: TypeNode.Any;
}

/** A closure's type parameters, its parameters in argument order, and its return type. */
export interface ClosureSignature {
  /** The type parameters, which are in scope in each other's bounds, the rest of the signature and the body. */
  readonly generics: readonly GenericParameter[];
  /** The parameters, which are in scope in the body alone. */
  readonly parameters: readonly ClosureParameter[];
  readonly returns: TypeNode.Any;
}

/** The record `fn` writes for a list of bindings, mapping each binding's name to its type. */
const typesByName = (
  bindings: readonly { readonly id: Referential.ReferenceId }[],
  types: readonly JExpr.Type.Type[],
): Record.ReadonlyRecord<string, JExpr.Type.Type> =>
  Record.fromEntries(
    Array.zipWith(bindings, types, ({ id }, type) => [
      Ident.compile(id.ident),
      type,
    ]),
  );

/**
 * A closure with its type parameters, parameters, return type and body, which emits the `fn` special form.
 *
 * `fn` writes the type parameters and the parameters as records keyed by name, so the names in each list must be distinct.
 */
export class Closure<T extends Node.Any>
  extends Pipeable.Class
  implements
    Node.Of<
      "Closure",
      JExpr.Call.Call,
      readonly [TypeNode.Any, ...TypeNode.Any[]],
      readonly [T]
    >
{
  readonly _tag = "Closure" as const;
  readonly signature: ClosureSignature;
  readonly child: T;
  readonly [Referential.References]: readonly Referential.ReferenceId[] = [];

  constructor(signature: ClosureSignature, child: T) {
    super();

    this.signature = signature;
    this.child = child;
  }

  /** The return type, then each type parameter's bound, then each parameter's type. */
  get types(): readonly [TypeNode.Any, ...TypeNode.Any[]] {
    const { generics, parameters, returns } = this.signature;

    return [
      returns,
      ...Array.map(generics, ({ bound }) => bound),
      ...Array.map(parameters, ({ type }) => type),
    ];
  }

  get children(): readonly [T] {
    return [this.child];
  }

  toExpr(
    [returns, ...signature]: readonly [JExpr.Type.Type, ...JExpr.Type.Type[]],
    [body]: readonly [Node.Expr<T>],
  ): JExpr.Call.Call {
    const { generics, parameters } = this.signature;
    const [bounds, types] = Array.splitAt(signature, generics.length);
    const options = { params: typesByName(parameters, types), returns, body };
    // Without `generics`, `fn` writes the empty tuple HashQL's own programs use, where an empty record would write `{"#struct":{}}`.
    if (!Array.isReadonlyArrayNonEmpty(generics)) {
      return JExpr.fn(options);
    }

    return JExpr.fn({ ...options, generics: typesByName(generics, bounds) });
  }
}

/** Recognizes a `Closure` node with its body typed as a `Node`, where `instanceof` alone gives `Closure<any>`. */
export const isClosure = (node: Node.Any): node is Closure<Node.Any> =>
  Predicate.isTagged(node, "Closure");
