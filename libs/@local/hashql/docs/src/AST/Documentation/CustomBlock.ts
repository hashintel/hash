import { Array, Equal, Hash, Predicate } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlock, DocSection } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/CustomBlock";

const fields = ["node"] as const;

/** A block the package's TSDoc configuration defines and that has no dedicated node. */
export class CustomBlock implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "CustomBlock" as const;

  readonly node: DocBlock;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(CustomBlock.prototype, Traits.Prototype);
  }

  constructor({ node }: CustomBlock.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    Object.freeze(this);
  }

  /** The tag name as written, including its `@`. */
  get tag(): string {
    return this.node.blockTag.tagName;
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
      isCustomBlock(other) &&
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

export declare namespace CustomBlock {
  type Fields = Pick<CustomBlock, (typeof fields)[number]>;
}

/** Recognises this node kind by its own marker. */
export const isCustomBlock = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is CustomBlock => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: CustomBlock.Fields): CustomBlock =>
  new CustomBlock(fields);
