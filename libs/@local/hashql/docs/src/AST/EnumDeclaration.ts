import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as EnumMember from "./EnumMember.js";
import type * as $Interned from "./Interned.js";
import type { Chunk, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/EnumDeclaration";

export class EnumDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "EnumDeclaration" as const;

  readonly node: TypeScript.EnumDeclaration;
  readonly members: Chunk.Chunk<EnumMember.Interned>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(EnumDeclaration.prototype, Traits.Prototype);
  }

  constructor({ node, members, documentation }: EnumDeclaration.Fields) {
    this.node = node;
    this.members = members;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.members)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isEnumDeclaration(other) &&
      this.node === other.node &&
      Equal.equals(this.members, other.members) &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      members: this.members,
      documentation: this.documentation,
    };
  }
}

export declare namespace EnumDeclaration {
  type Fields = Pick<EnumDeclaration, "node" | "members" | "documentation">;
}

export type Interned = $Interned.Interned<EnumDeclaration>;

/** Recognises this node kind by its own marker. */
export const isEnumDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is EnumDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: EnumDeclaration.Fields): EnumDeclaration =>
  new EnumDeclaration(fields);
