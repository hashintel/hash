import { Array, Equal, Hash, Option, Predicate } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as CallSignature from "./CallSignature.js";
import type * as $Interned from "./Interned.js";
import type { Chunk, Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Method/method";

const fields = ["overloads", "name", "static"] as const;

/** A method's ordered overloads retain their individual signatures and comments. */
export class MethodOverloads implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Method" as const;
  readonly flavour = "method" as const;

  readonly overloads: Chunk.NonEmptyChunk<CallSignature.Interned>;
  /** The member's name as its declaration spells it, without the quotes of a string-literal name. */
  readonly name: string;
  /** Whether the member belongs to its class rather than to its instances. */
  readonly static: boolean;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(MethodOverloads.prototype, Traits.Prototype);
  }

  constructor({ overloads, name, static: isStatic }: MethodOverloads.Fields) {
    this.overloads = overloads;
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
      isMethodOverloads(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      flavour: this.flavour,
      overloads: this.overloads,
      name: this.name,
      static: this.static,
    };
  }
}

export declare namespace MethodOverloads {
  type Fields = Pick<MethodOverloads, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<MethodOverloads>;

/** Recognises this callable form by its own marker. */
export const isMethodOverloads = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is MethodOverloads => Predicate.hasProperty(value, TypeId);

/** Creates the callable node without expanding its interned signatures. */
export const make = (fields: MethodOverloads.Fields): MethodOverloads =>
  new MethodOverloads(fields);
