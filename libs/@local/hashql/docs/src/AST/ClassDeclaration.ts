import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Member from "./Member.js";
import type * as TypeNode from "./TypeNode.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Chunk, Inspectable, Option } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/ClassDeclaration";

const fields = [
  "node",
  "typeParameters",
  "extends",
  "implements",
  "members",
  "documentation",
] as const;

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
    this.node = Equal.byReferenceUnsafe(node);
    this.typeParameters = typeParameters;
    this.extends = base;
    this.implements = interfaces;
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
      isClassDeclaration(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
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
  type Fields = Pick<ClassDeclaration, (typeof fields)[number]>;
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
