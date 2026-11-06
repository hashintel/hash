import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Member from "./Member.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/InterfaceDeclaration";

const fields = [
  "node",
  "typeParameters",
  "extends",
  "members",
  "documentation",
] as const;

export class InterfaceDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "InterfaceDeclaration" as const;

  readonly node: TypeScript.InterfaceDeclaration;
  readonly typeParameters: Chunk.Chunk<TypeParameter.Interned>;
  readonly extends: Chunk.Chunk<TypeNode.Interned>;
  readonly members: Chunk.Chunk<Member.InternedType>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(InterfaceDeclaration.prototype, Traits.Prototype);
  }

  constructor({
    node,
    typeParameters,
    extends: bases,
    members,
    documentation,
  }: InterfaceDeclaration.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.typeParameters = typeParameters;
    this.extends = bases;
    this.members = members;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isInterfaceDeclaration(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      typeParameters: this.typeParameters,
      extends: this.extends,
      members: this.members,
      documentation: this.documentation,
    };
  }
}

export declare namespace InterfaceDeclaration {
  type Fields = Pick<InterfaceDeclaration, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<InterfaceDeclaration>;

/** Recognises this node kind by its own marker. */
export const isInterfaceDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is InterfaceDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (
  fields: InterfaceDeclaration.Fields,
): InterfaceDeclaration => new InterfaceDeclaration(fields);
