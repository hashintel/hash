import { Array, Equal, Hash, Option, Predicate } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as Getter from "./Getter.js";
import type * as $Interned from "./Interned.js";
import type * as Setter from "./Setter.js";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Accessor";

const fields = ["get", "set", "name", "static"] as const;

/** A property's getter and setter retain their individual signatures and comments. */
export class Accessor implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Accessor" as const;

  readonly get: Option.Option<Getter.Interned>;
  readonly set: Option.Option<Setter.Interned>;
  /** The member's name as its declaration spells it, without the quotes of a string-literal name. */
  readonly name: string;
  /** Whether the member belongs to its class rather than to its instances. */
  readonly static: boolean;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Accessor.prototype, Traits.Prototype);
  }

  constructor({ get, set, name, static: isStatic }: Accessor.Fields) {
    this.get = get;
    this.set = set;
    this.name = name;
    this.static = isStatic;
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isAccessor(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      get: this.get,
      set: this.set,
      name: this.name,
      static: this.static,
    };
  }
}

export declare namespace Accessor {
  type Fields = Pick<Accessor, (typeof fields)[number]>;
  type Part = Getter.Getter | Setter.Setter;
}

export type Interned = $Interned.Interned<Accessor>;

/** Recognises this node kind by its own marker. */
export const isAccessor = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Accessor => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Accessor.Fields): Accessor => new Accessor(fields);
