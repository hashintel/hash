import { Array, Equal, Hash, Predicate } from "effect";

import * as Source from "../internal/ast/source.js";
import * as Traits from "../internal/ast/traits.js";

import type * as $Interned from "./Interned.js";
import type * as TypeNode from "./TypeNode.js";
import type { Inspectable, Option } from "effect";
import type * as TypeScript from "typescript/ast";

const TypeId = "~hashql-docs/AST/ConstantDeclaration";

const fields = ["node", "type", "documentation"] as const;

/** A non-callable variable keeps its source declaration, including any literal initializer. */
export class ConstantDeclaration implements Traits.Traits {
  readonly [TypeId] = TypeId;
  readonly _tag = "ConstantDeclaration" as const;

  readonly node: TypeScript.VariableDeclaration;
  readonly type: Option.Option<TypeNode.Interned>;
  readonly documentation: Traits.Traits["documentation"];

  declare readonly pipe: Traits.Traits["pipe"];
  declare readonly toString: Traits.Traits["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Traits[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(ConstantDeclaration.prototype, Traits.Prototype);
  }

  constructor({ node, type, documentation }: ConstantDeclaration.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.type = type;
    this.documentation = documentation;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isConstantDeclaration(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Traits.Inspection {
    return {
      _tag: this._tag,
      node: Source.inspectNode(this.node),
      type: this.type,
      documentation: this.documentation,
    };
  }
}

export declare namespace ConstantDeclaration {
  type Fields = Pick<ConstantDeclaration, (typeof fields)[number]>;
}

export type Interned = $Interned.Interned<ConstantDeclaration>;

/** Recognises this node kind by its own marker. */
export const isConstantDeclaration = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is ConstantDeclaration => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: ConstantDeclaration.Fields): ConstantDeclaration =>
  new ConstantDeclaration(fields);
