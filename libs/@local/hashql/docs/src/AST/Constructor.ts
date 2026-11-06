import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as ConstructSignature from "./ConstructSignature.js";
import type * as $Interned from "./Interned.js";
import type { Chunk, Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Constructor";

export class Constructor implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Constructor" as const;

  readonly overloads: Chunk.NonEmptyChunk<ConstructSignature.Interned>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Constructor.prototype, Traits.Prototype);
  }

  constructor({ overloads }: Constructor.Fields) {
    this.overloads = overloads;
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.hash(this.overloads)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isConstructor(other) && Equal.equals(this.overloads, other.overloads)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      overloads: this.overloads,
    };
  }
}

export declare namespace Constructor {
  type Fields = Pick<Constructor, "overloads">;
}

export type Interned = $Interned.Interned<Constructor>;

/** Recognises this node kind by its own marker. */
export const isConstructor = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Constructor => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Constructor.Fields): Constructor =>
  new Constructor(fields);
