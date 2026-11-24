import { Array, Chunk, Equal, Hash, Option, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Target from "./Target.js";
import type * as TypeNode from "./TypeNode.js";
import type { Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/TypeReference";

const fields = ["node", "qualifiers", "target", "typeArguments"] as const;

/** Named types and type queries share resolved targets without expanding those targets inline. */
export class TypeReference implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "TypeReference" as const;

  readonly node:
    | TypeScript.TypeReferenceNode
    | TypeScript.TypeQueryNode
    | TypeScript.ImportTypeNode
    | TypeScript.ExpressionWithTypeArguments;
  /**
   * The symbols the names in front of the target resolve to, in source order, such as `AST` in `AST.Node`, with an import type's module first.
   *
   * A qualifier names a node the AST holds for its own sake, or else an item outside the package, which is also what a private namespace of the package reads as.
   */
  readonly qualifiers: Chunk.Chunk<Target.InternedSymbol>;
  /** The symbol the reference's name resolves to, aliases followed. */
  readonly target: Target.InternedSymbol;
  readonly typeArguments: Chunk.Chunk<TypeNode.Interned>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(TypeReference.prototype, Traits.Prototype);
  }

  constructor({
    node,
    qualifiers,
    target,
    typeArguments,
  }: TypeReference.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.qualifiers = Chunk.map(qualifiers, Equal.byReferenceUnsafe);
    this.target = Equal.byReferenceUnsafe(target);
    this.typeArguments = typeArguments;
    Object.freeze(this);
  }

  /** Syntax in type position carries no comment of its own. */
  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isTypeReference(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      qualifiers: Chunk.map(this.qualifiers, Source.inspectSymbol),
      target: Source.inspectSymbol(this.target),
      typeArguments: this.typeArguments,
    };
  }
}

export declare namespace TypeReference {
  type Fields = Pick<TypeReference, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<TypeReference>;

/** Recognises this node kind by its own marker. */
export const isTypeReference = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is TypeReference => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: TypeReference.Fields): TypeReference =>
  new TypeReference(fields);
