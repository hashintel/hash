import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Member from "./Member.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Chunk, Inspectable, Option } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/ClassDeclaration";

export class ClassDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "ClassDeclaration" as const;

  readonly node: TypeScript.ClassDeclaration;
  readonly typeParameters: Chunk.Chunk<TypeParameter.Interned>;
  readonly extends: Option.Option<TypeNode.Interned>;
  readonly implements: Chunk.Chunk<TypeNode.Interned>;
  readonly members: Chunk.Chunk<Member.InternedClass>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(ClassDeclaration.prototype, Traits.Prototype);
  }

  constructor({
    node,
    typeParameters,
    extends: base,
    implements: interfaces,
    members,
    documentation,
  }: ClassDeclaration.Fields) {
    this.node = node;
    this.typeParameters = typeParameters;
    this.extends = base;
    this.implements = interfaces;
    this.members = members;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.typeParameters)),
      Hash.combine(Hash.hash(this.extends)),
      Hash.combine(Hash.hash(this.implements)),
      Hash.combine(Hash.hash(this.members)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isClassDeclaration(other) &&
      this.node === other.node &&
      Equal.equals(this.typeParameters, other.typeParameters) &&
      Equal.equals(this.extends, other.extends) &&
      Equal.equals(this.implements, other.implements) &&
      Equal.equals(this.members, other.members) &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      typeParameters: this.typeParameters,
      extends: this.extends,
      implements: this.implements,
      members: this.members,
      documentation: this.documentation,
    };
  }
}

export declare namespace ClassDeclaration {
  type Fields = Pick<
    ClassDeclaration,
    | "node"
    | "typeParameters"
    | "extends"
    | "implements"
    | "members"
    | "documentation"
  >;
}

export type Interned = $Interned.Interned<ClassDeclaration>;

/** Recognises this node kind by its own marker. */
export const isClassDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is ClassDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: ClassDeclaration.Fields): ClassDeclaration =>
  new ClassDeclaration(fields);
