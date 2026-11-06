import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as CallSignature from "./CallSignature.js";
import type * as $Interned from "./Interned.js";
import type { Chunk, Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Method";

export class Method implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Method" as const;

  readonly overloads: Chunk.NonEmptyChunk<CallSignature.Interned>;
  /** The member's name as its declaration spells it, without the quotes of a string-literal name. */
  readonly name: string;
  /** Whether the member belongs to its class rather than to its instances. */
  readonly static: boolean;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Method.prototype, Traits.Prototype);
  }

  constructor({ overloads, name, static: isStatic }: Method.Fields) {
    this.overloads = overloads;
    this.name = name;
    this.static = isStatic;
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.hash(this.overloads)),
      Hash.combine(Hash.string(this.name)),
      Hash.combine(Hash.hash(this.static)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isMethod(other) &&
      Equal.equals(this.overloads, other.overloads) &&
      this.name === other.name &&
      this.static === other.static
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      overloads: this.overloads,
      name: this.name,
      static: this.static,
    };
  }
}

export declare namespace Method {
  type Fields = Pick<Method, "overloads" | "name" | "static">;
}

export type Interned = $Interned.Interned<Method>;

/** Recognises this node kind by its own marker. */
export const isMethod = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Method => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Method.Fields): Method => new Method(fields);
