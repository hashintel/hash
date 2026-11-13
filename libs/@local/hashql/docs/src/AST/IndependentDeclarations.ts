import { Array, Equal, Hash, Option, Predicate } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as TypeDeclaration from "./TypeDeclaration.js";
import type * as ValueDeclaration from "./ValueDeclaration.js";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/IndependentDeclarations";

const fields = ["type", "value"] as const;

/** A type and a value can share a name without either declaring the other. */
export class IndependentDeclarations implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "IndependentDeclarations" as const;

  readonly type: Option.Option<TypeDeclaration.Interned>;
  readonly value: Option.Option<ValueDeclaration.Interned>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(IndependentDeclarations.prototype, Traits.Prototype);
  }

  constructor({ type, value }: IndependentDeclarations.Fields) {
    this.type = type;
    this.value = value;
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isIndependentDeclarations(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      type: this.type,
      value: this.value,
    };
  }
}

export declare namespace IndependentDeclarations {
  type Fields = Pick<IndependentDeclarations, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<IndependentDeclarations>;

/** Recognises this node kind by its own marker. */
export const isIndependentDeclarations = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is IndependentDeclarations => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (
  fields: IndependentDeclarations.Fields,
): IndependentDeclarations => new IndependentDeclarations(fields);
