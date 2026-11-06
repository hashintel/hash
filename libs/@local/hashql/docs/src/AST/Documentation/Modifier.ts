import { Array, Equal, Hash, Predicate } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlockTag } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Modifier";

const fields = ["node"] as const;

/** A modifier tag, such as `@internal`, which marks a declaration without carrying content. */
export class Modifier implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Modifier" as const;

  readonly node: DocBlockTag;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Modifier.prototype, Traits.Prototype);
  }

  constructor({ node }: Modifier.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    Object.freeze(this);
  }

  /** The tag name as written, including its `@`. */
  get tag(): string {
    return this.node.tagName;
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isModifier(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      tag: this.tag,
    };
  }
}

export declare namespace Modifier {
  type Fields = Pick<Modifier, (typeof fields)[number]>;
}

/** Recognises this node kind by its own marker. */
export const isModifier = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Modifier => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Modifier.Fields): Modifier => new Modifier(fields);
