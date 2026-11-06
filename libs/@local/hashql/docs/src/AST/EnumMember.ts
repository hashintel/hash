import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type { Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/EnumMember";

export class EnumMember implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "EnumMember" as const;

  readonly node: TypeScript.EnumMember;
  readonly name: string;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(EnumMember.prototype, Traits.Prototype);
  }

  constructor({ node, name, documentation }: EnumMember.Fields) {
    this.node = node;
    this.name = name;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.name)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isEnumMember(other) &&
      this.node === other.node &&
      this.name === other.name &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      name: this.name,
      documentation: this.documentation,
    };
  }
}

export declare namespace EnumMember {
  type Fields = Pick<EnumMember, "node" | "name" | "documentation">;
}

export type Interned = $Interned.Interned<EnumMember>;

/** Recognises this node kind by its own marker. */
export const isEnumMember = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is EnumMember => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: EnumMember.Fields): EnumMember =>
  new EnumMember(fields);
