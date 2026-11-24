import { Array, Chunk, Equal, Hash, Option, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Target from "./Target.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/TypeExpression";

const fields = ["node", "children", "references"] as const;

/** Other type syntax keeps its source spelling and exposes its nested types and bindings for traversal. */
export class TypeExpression implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "TypeExpression" as const;

  readonly node: TypeScript.TypeNode;
  readonly children: Chunk.Chunk<
    $Interned.Interned<TypeNode.TypeNode | TypeParameter.TypeParameter>
  >;
  /** The symbols the names in it resolve to, such as the parameter a type predicate tests, in source order. */
  readonly references: Chunk.Chunk<Target.InternedSymbol>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(TypeExpression.prototype, Traits.Prototype);
  }

  constructor({ node, children, references }: TypeExpression.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.children = children;
    this.references = Chunk.map(references, Equal.byReferenceUnsafe);
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
      isTypeExpression(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      children: this.children,
      references: Chunk.map(this.references, Source.inspectSymbol),
    };
  }
}

export declare namespace TypeExpression {
  type Fields = Pick<TypeExpression, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<TypeExpression>;

/** Recognises this node kind by its own marker. */
export const isTypeExpression = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is TypeExpression => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: TypeExpression.Fields): TypeExpression =>
  new TypeExpression(fields);
