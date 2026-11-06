import { Array, Equal, Hash, Option, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";
import * as Reference from "./Reference.js";

import type * as $Interned from "./Interned.js";
import type * as LeafDeclaration from "./LeafDeclaration.js";
import type * as NamespaceDeclaration from "./NamespaceDeclaration.js";
import type { Inspectable } from "effect";
import type { Symbol as CompilerSymbol } from "typescript/async";

const TypeId = "~hashql-docs/AST/Declaration";

const sameBases = Array.makeEquivalence<Reference.Reference.Target>(
  Reference.sameTarget,
);

/** A name's supported type, value and namespace meanings share the compiler symbol's identity. */
export class Declaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Declaration" as const;

  readonly symbol: CompilerSymbol;
  readonly leaf: Option.Option<LeafDeclaration.Interned>;
  readonly namespace: Option.Option<NamespaceDeclaration.Interned>;
  /** The interfaces and classes it extends or implements directly, as the checker reads them, so a base the syntax cannot name is among them too. Empty for any other declaration. */
  readonly bases: readonly Reference.Reference.Target[];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Declaration.prototype, Traits.Prototype);
  }

  constructor({ symbol, leaf, namespace, bases }: Declaration.Fields) {
    this.symbol = symbol;
    this.leaf = leaf;
    this.namespace = namespace;
    this.bases = Object.freeze(Array.copy(bases));
    Object.freeze(this);
  }

  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.symbol)),
      Hash.combine(Hash.hash(this.leaf)),
      Hash.combine(Hash.hash(this.namespace)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isDeclaration(other) &&
      this.symbol === other.symbol &&
      Equal.equals(this.leaf, other.leaf) &&
      Equal.equals(this.namespace, other.namespace) &&
      sameBases(this.bases, other.bases)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      symbol: Source.inspectSymbol(this.symbol),
      leaf: this.leaf,
      namespace: this.namespace,
      bases: Array.map(this.bases, (base) =>
        base._tag === "Local"
          ? { _tag: base._tag, node: base.node }
          : { _tag: base._tag, name: base.name },
      ),
    };
  }
}

export declare namespace Declaration {
  type Fields = Pick<Declaration, "symbol" | "leaf" | "namespace" | "bases">;
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
