import { Array, Equal, Hash, Option, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as LeafDeclaration from "./LeafDeclaration.js";
import type * as NamespaceDeclaration from "./NamespaceDeclaration.js";
import type * as Target from "./Target.js";
import type { Inspectable } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

const TypeId = "~hashql-docs/AST/Declaration";

const fields = ["symbol", "leaf", "namespace", "bases"] as const;

/** A name's supported type, value and namespace meanings share the compiler symbol's identity. */
export class Declaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Declaration" as const;

  readonly symbol: CompilerSymbol;
  readonly leaf: Option.Option<LeafDeclaration.Interned>;
  readonly namespace: Option.Option<NamespaceDeclaration.Interned>;
  /** The interfaces and classes it extends or implements directly, as the checker reads them, so a base the syntax cannot name is among them too. Empty for any other declaration. */
  readonly bases: readonly Target.InternedSymbol[];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Declaration.prototype, Traits.Prototype);
  }

  constructor({ symbol, leaf, namespace, bases }: Declaration.Fields) {
    this.symbol = Equal.byReferenceUnsafe(symbol);
    this.leaf = leaf;
    this.namespace = namespace;
    this.bases = Object.freeze(Array.map(bases, Equal.byReferenceUnsafe));
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isDeclaration(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      symbol: Source.inspectSymbol(this.symbol),
      leaf: this.leaf,
      namespace: this.namespace,
      bases: Array.map(this.bases, Source.inspectSymbol),
    };
  }
}

export declare namespace Declaration {
  type Fields = Pick<Declaration, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<Declaration>;

/** Recognises this node kind by its own marker. */
export const isDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Declaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Declaration.Fields): Declaration =>
  new Declaration(fields);
