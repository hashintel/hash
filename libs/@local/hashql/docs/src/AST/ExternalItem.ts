import { Array, Equal, Hash, Option, Predicate, Record } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as ExternalTarget from "../ExternalTarget.js";
import type * as $Interned from "./Interned.js";
import type { Inspectable } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

const TypeId = "~hashql-docs/AST/ExternalItem";

const fields = ["symbol", "name", "pages", "bases"] as const;

/** A symbol outside the package, such as one a dependency or TypeScript's library declares, with the pages that document it. */
export class ExternalItem implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "ExternalItem" as const;

  readonly symbol: CompilerSymbol;
  /** The name its pages give the symbol, qualified by its module for one of Effect's, as in `Equal.Equal`. */
  readonly name: string;
  /** The page that documents the symbol for each meaning a name can read it with, which differ where declarations of different kinds share the name. */
  readonly pages: ExternalItem.Pages;
  /** The interfaces and classes it extends or implements directly, which are outside the package too. */
  readonly bases: readonly InternedSymbol[];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(ExternalItem.prototype, Traits.Prototype);
  }

  constructor({ symbol, name, pages, bases }: ExternalItem.Fields) {
    this.symbol = Equal.byReferenceUnsafe(symbol);
    this.name = name;
    this.pages = Object.freeze({ ...pages });
    this.bases = Object.freeze(Array.map(bases, Equal.byReferenceUnsafe));
    Object.freeze(this);
  }

  /** Comes from outside the package, so the package documents none of it. */
  readonly documentation: Traits.Traits["documentation"] = Option.none();

  /** The page for the symbol as a name with `meaning` reads it. */
  page(meaning: ExternalTarget.Meaning): Option.Option<URL> {
    return this.pages[meaning];
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isExternalItem(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      symbol: Source.inspectSymbol(this.symbol),
      name: this.name,
      pages: Record.map(this.pages, (page) =>
        Option.map(page, (url) => url.href),
      ),
      bases: Array.map(this.bases, Source.inspectSymbol),
    };
  }
}

export declare namespace ExternalItem {
  type Fields = Pick<ExternalItem, (typeof fields)[number]>;
  type Pages = Readonly<Record<ExternalTarget.Meaning, Option.Option<URL>>>;
}

export type Interned = $Interned.Interned<ExternalItem>;

export type InternedSymbol = $Interned.InternedSymbol<ExternalItem>;

/** Recognises this node kind by its own marker. */
export const isExternalItem = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is ExternalItem => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: ExternalItem.Fields): ExternalItem =>
  new ExternalItem(fields);
