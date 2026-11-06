import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as CallSignature from "./CallSignature.js";
import type * as $Interned from "./Interned.js";
import type { Chunk, Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/FunctionDeclaration/function";

/** A function's ordered overloads retain their individual signatures and comments. */
export class FunctionOverloads implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "FunctionDeclaration" as const;
  readonly flavour = "function" as const;
  readonly overloads: Chunk.NonEmptyChunk<CallSignature.Interned>;
  readonly documentation: Traits.Traits["documentation"] = Option.none();

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(FunctionOverloads.prototype, Traits.Prototype);
  }

  constructor({ overloads }: FunctionOverloads.Fields) {
    this.overloads = overloads;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.string(this.flavour)),
      Hash.combine(Hash.hash(this.overloads)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isFunctionOverloads(other) &&
      Equal.equals(this.overloads, other.overloads)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      flavour: this.flavour,
      overloads: this.overloads,
    };
  }
}

export declare namespace FunctionOverloads {
  type Fields = Pick<FunctionOverloads, "overloads">;
}

export type Interned = $Interned.Interned<FunctionOverloads>;

/** Recognises this callable form by its own marker. */
export const isFunctionOverloads = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is FunctionOverloads => Predicate.hasProperty(value, TypeId);

/** Creates the callable node without expanding its interned signatures. */
export const make = (fields: FunctionOverloads.Fields): FunctionOverloads =>
  new FunctionOverloads(fields);
