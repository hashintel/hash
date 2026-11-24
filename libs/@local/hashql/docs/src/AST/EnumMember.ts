import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type { Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/EnumMember";

const fields = ["node", "name", "documentation"] as const;

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
    this.node = Equal.byReferenceUnsafe(node);
    this.name = name;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isEnumMember(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
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
  type Fields = Pick<EnumMember, (typeof fields)[number]>;
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
