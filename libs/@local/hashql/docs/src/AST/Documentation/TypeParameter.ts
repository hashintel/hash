import { Array, Equal, Hash, Predicate } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocParamBlock, DocSection } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/TypeParameter";

const fields = ["node"] as const;

/** One `@typeParam` block, which describes a type parameter by the name it is declared with. */
export class TypeParameter implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "TypeParameter" as const;

  readonly node: DocParamBlock;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(TypeParameter.prototype, Traits.Prototype);
  }

  constructor({ node }: TypeParameter.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    Object.freeze(this);
  }

  get name(): string {
    return this.node.parameterName;
  }

  get content(): DocSection {
    return this.node.content;
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isTypeParameter(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      name: this.name,
    };
  }
}

export declare namespace TypeParameter {
  type Fields = Pick<TypeParameter, (typeof fields)[number]>;
}

/** Recognises this node kind by its own marker. */
export const isTypeParameter = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is TypeParameter => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: TypeParameter.Fields): TypeParameter =>
  new TypeParameter(fields);
