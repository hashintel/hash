import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as Signature from "./Signature.js";
import type { Inspectable } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/ConstructSignature";

const fields = [
  "typeParameters",
  "parameters",
  "returns",
  "node",
  "documentation",
] as const;

export class ConstructSignature implements Traits.Traits, Signature.Signature {
  readonly [TypeId] = TypeId;
  readonly _tag = "ConstructSignature" as const;

  readonly typeParameters: Signature.Signature["typeParameters"];
  readonly parameters: Signature.Signature["parameters"];
  readonly returns: Signature.Signature["returns"];

  readonly node:
    | TypeScript.ConstructSignatureDeclaration
    | TypeScript.ConstructorDeclaration
    | TypeScript.ConstructorTypeNode;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(ConstructSignature.prototype, Traits.Prototype);
  }

  constructor({
    typeParameters,
    parameters,
    returns,
    node,
    documentation,
  }: ConstructSignature.Fields) {
    this.typeParameters = typeParameters;
    this.parameters = parameters;
    this.returns = returns;
    this.node = Equal.byReferenceUnsafe(node);
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isConstructSignature(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
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

export declare namespace ConstructSignature {
  type Fields = Pick<ConstructSignature, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<ConstructSignature>;

/** Recognises this node kind by its own marker. */
export const isConstructSignature = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is ConstructSignature => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: ConstructSignature.Fields): ConstructSignature =>
  new ConstructSignature(fields);
