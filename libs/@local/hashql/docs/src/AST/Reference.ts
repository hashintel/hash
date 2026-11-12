// oxlint-disable import/max-dependencies -- A local target is one of four node kinds, and a name in an example carries its quick info.
import { Array, Equal, Function, Hash, Option, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as QuickInfo from "../QuickInfo.js";
import type * as Declaration from "./Declaration.js";
import type * as $Interned from "./Interned.js";
import type * as Member from "./Member.js";
import type * as Parameter from "./Parameter.js";
import type * as TypeParameter from "./TypeParameter.js";
import type { Data, Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

const TypeId = "~hashql-docs/AST/Reference";

const fields = ["node", "target", "url", "quickInfo"] as const;

/** References name the same thing when they resolve to the same node of the AST, or to the same symbol outside it. */
export const sameTarget: {
  (that: Reference.Target): (self: Reference.Target) => boolean;
  (self: Reference.Target, that: Reference.Target): boolean;
} = Function.dual(
  2,
  (self: Reference.Target, that: Reference.Target): boolean => {
    if (self._tag === "Local") {
      return that._tag === "Local" && self.node === that.node;
    }
    return that._tag === "External" && self.symbol === that.symbol;
  },
);

const inspectTarget = (target: Reference.Target): Traits.Traits.Inspection => {
  if (target._tag === "Local") {
    return { _tag: target._tag, node: target.node };
  }
  return {
    _tag: target._tag,
    symbol: Source.inspectSymbol(target.symbol),
    name: target.name,
    url: Option.map(target.url, (url) => url.href),
    bases: Array.map(target.bases, inspectTarget),
  };
};

/** `info` as a reference holds it, with the syntax the compiler built for it compared by identity. */
const identify = (info: QuickInfo.QuickInfo): QuickInfo.QuickInfo => {
  if (info._tag === "Callable") {
    if (Option.isSome(info.signature)) {
      Equal.byReferenceUnsafe(info.signature.value);
    }
  } else if (info._tag === "Value") {
    Equal.byReferenceUnsafe(info.type);
  } else if (info._tag === "Alias") {
    Equal.byReferenceUnsafe(info.type);

    for (const parameter of info.typeParameters) {
      Equal.byReferenceUnsafe(parameter);
    }
  } else if (info._tag === "Declared") {
    for (const parameter of info.typeParameters) {
      Equal.byReferenceUnsafe(parameter);
    }
  }

  return info;
};

/** `target` as a node holds it: frozen, with an external target's symbol compared by identity. */
export const freezeTarget = (target: Reference.Target): Reference.Target => {
  if (target._tag === "Local") {
    return Object.freeze({ _tag: "Local", node: target.node });
  }
  return Object.freeze({
    _tag: "External",
    symbol: Equal.byReferenceUnsafe(target.symbol),
    name: target.name,
    url: target.url,
    bases: Object.freeze(Array.map(target.bases, freezeTarget)),
  });
};

/** A resolved name points into this AST or to a symbol outside it, such as one a dependency declares. */
export class Reference implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "Reference" as const;

  readonly node: TypeScript.Node;
  readonly target: Reference.Target;
  /** The page that documents an external target as the name reads where it stands, such as a type or the namespace of the same name. None for a local target. */
  readonly url: Option.Option<URL>;
  /** What an editor shows on hover over the name, for a name in an example's code. */
  readonly quickInfo: Option.Option<QuickInfo.QuickInfo>;

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Reference.prototype, Traits.Prototype);
  }

  constructor({ node, target, url, quickInfo }: Reference.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.target = freezeTarget(target);
    this.url = url;
    this.quickInfo = Option.map(quickInfo, identify);
    Object.freeze(this);
  }

  /** Syntax in type position carries no comment of its own. */
  readonly documentation: Traits.Traits["documentation"] = Option.none();

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isReference(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      target: inspectTarget(this.target),
      url: Option.map(this.url, (url) => url.href),
      quickInfo: this.quickInfo,
    };
  }
}

export declare namespace Reference {
  type Fields = Pick<Reference, (typeof fields)[number]>;
  type Target = Data.TaggedEnum<{
    Local: {
      readonly node: $Interned.Interned<
        | Declaration.Declaration
        | Member.Member
        | TypeParameter.TypeParameter
        | Parameter.Parameter
      >;
    };
    External: {
      readonly symbol: CompilerSymbol;
      /** The name the symbol is documented under, qualified by its module for one of Effect's, as in `Equal.Equal`. */
      readonly name: string;
      /** The page that documents the symbol's type, which a base in a hierarchy links to. */
      readonly url: Option.Option<URL>;
      /** The interfaces and classes it extends or implements directly. */
      readonly bases: readonly Target[];
    };
  }>;
}

export type Interned = $Interned.Interned<Reference>;

/** Recognises this node kind by its own marker. */
export const isReference = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Reference => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Reference.Fields): Reference =>
  new Reference(fields);
