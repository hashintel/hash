import { Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Traits from "../internal/ast/traits.js";

import type * as Declaration from "./Declaration.js";
import type * as $Interned from "./Interned.js";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Alias";

/** An exported name refers to a declaration without changing its exposure through other names. */
export class Alias implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Alias" as const;
  readonly name: string;
  readonly target: Declaration.Interned;
  /** True when every path exposing this binding restricts it to type-only use. */
  readonly typeOnlyExport: boolean;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Alias.prototype, Traits.Prototype);
  }

  constructor({ name, target, typeOnlyExport }: Alias.Fields) {
    this.name = name;
    this.target = target;
    this.typeOnlyExport = typeOnlyExport;
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.hash(this.name)),
      Hash.combine(Hash.hash(this.target)),
      Hash.combine(Hash.hash(this.typeOnlyExport)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isAlias(other) &&
      this.name === other.name &&
      this.target === other.target &&
      this.typeOnlyExport === other.typeOnlyExport
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      name: this.name,
      target: this.target,
      typeOnlyExport: this.typeOnlyExport,
    };
  }
}

export declare namespace Alias {
  type Fields = Pick<Alias, "name" | "target" | "typeOnlyExport">;
}

export type Interned = $Interned.Interned<Alias>;

/** Recognises an owned alias by its node marker. */
export const isAlias = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Alias => Predicate.hasProperty(value, TypeId);

/** Creates an alias with value equality over its exported name, target and restriction. */
export const make = (fields: Alias.Fields): Alias => new Alias(fields);
