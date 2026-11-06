import { Equal, Hash, Predicate, pipe } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Signature from "./Signature.js";
import type { Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/Getter";

export class Getter implements Traits.Traits, Signature.Signature {
  readonly [TypeId] = TypeId;
  readonly _tag = "Getter" as const;

  readonly typeParameters: Signature.Signature["typeParameters"];
  readonly parameters: Signature.Signature["parameters"];
  readonly returns: Signature.Signature["returns"];

  readonly node: TypeScript.GetAccessorDeclaration;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Getter.prototype, Traits.Prototype);
  }

  constructor({
    typeParameters,
    parameters,
    returns,
    node,
    documentation,
  }: Getter.Fields) {
    this.typeParameters = typeParameters;
    this.parameters = parameters;
    this.returns = returns;
    this.node = node;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.hash(this.typeParameters)),
      Hash.combine(Hash.hash(this.parameters)),
      Hash.combine(Hash.hash(this.returns)),
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.documentation)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isGetter(other) &&
      Equal.equals(this.typeParameters, other.typeParameters) &&
      Equal.equals(this.parameters, other.parameters) &&
      Equal.equals(this.returns, other.returns) &&
      this.node === other.node &&
      Equal.equals(this.documentation, other.documentation)
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      typeParameters: this.typeParameters,
      parameters: this.parameters,
      returns: this.returns,
      node: Source.inspectNode(this.node),
      documentation: this.documentation,
    };
  }
}

export declare namespace Getter {
  type Fields = Pick<
    Getter,
    "typeParameters" | "parameters" | "returns" | "node" | "documentation"
  >;
}

export type Interned = $Interned.Interned<Getter>;

/** Recognises this node kind by its own marker. */
export const isGetter = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Getter => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Getter.Fields): Getter => new Getter(fields);
