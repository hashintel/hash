import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Reference from "./Reference.js";
import type * as TypeNode from "./TypeNode.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/TypeReference";

/** Named types and type queries share resolved targets without expanding those targets inline. */
export class TypeReference implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "TypeReference" as const;

  readonly node:
    | TypeScript.TypeReferenceNode
    | TypeScript.TypeQueryNode
    | TypeScript.ImportTypeNode
    | TypeScript.ExpressionWithTypeArguments;
  readonly reference: Reference.Interned;
  readonly typeArguments: Chunk.Chunk<TypeNode.Interned>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(TypeReference.prototype, Traits.Prototype);
  }

  constructor({ node, reference, typeArguments }: TypeReference.Fields) {
    this.node = node;
    this.reference = reference;
    this.typeArguments = typeArguments;
    Object.freeze(this);
  }

  /** Syntax in type position carries no comment of its own. */
  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.reference)),
      Hash.combine(Hash.hash(this.typeArguments)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isTypeReference(other) &&
      this.node === other.node &&
      this.reference === other.reference &&
      Equal.equals(this.typeArguments, other.typeArguments)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      reference: this.reference,
      typeArguments: this.typeArguments,
    };
  }
}

export declare namespace TypeReference {
  type Fields = Pick<TypeReference, "node" | "reference" | "typeArguments">;
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
