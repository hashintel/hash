import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/TypeAliasDeclaration";

const fields = ["node", "typeParameters", "type", "documentation"] as const;

/** A named type alias retains its authored type rather than expanding it. */
export class TypeAliasDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "TypeAliasDeclaration" as const;

  readonly node: TypeScript.TypeAliasDeclaration;
  readonly typeParameters: Chunk.Chunk<TypeParameter.Interned>;
  readonly type: TypeNode.Interned;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(TypeAliasDeclaration.prototype, Traits.Prototype);
  }

  constructor({
    node,
    typeParameters,
    type,
    documentation,
  }: TypeAliasDeclaration.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.typeParameters = typeParameters;
    this.type = type;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isTypeAliasDeclaration(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      typeParameters: this.typeParameters,
      type: this.type,
      documentation: this.documentation,
    };
  }
}

export declare namespace TypeAliasDeclaration {
  type Fields = Pick<TypeAliasDeclaration, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<TypeAliasDeclaration>;

/** Recognises this node kind by its own marker. */
export const isTypeAliasDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is TypeAliasDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (
  fields: TypeAliasDeclaration.Fields,
): TypeAliasDeclaration => new TypeAliasDeclaration(fields);
