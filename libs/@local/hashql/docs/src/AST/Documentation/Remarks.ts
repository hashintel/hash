import { Array, Equal, Hash, Predicate } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlock, DocSection } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Remarks";

const fields = ["node"] as const;

/** The `@remarks` block, which carries the detail a description leaves out. */
export class Remarks implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Remarks" as const;

  readonly node: DocBlock;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Remarks.prototype, Traits.Prototype);
  }

  constructor({ node }: Remarks.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    Object.freeze(this);
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
      isRemarks(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Base.Inspection {
    return { _tag: this._tag, node: DocSource.inspectNode(this.node) };
  }
}

export declare namespace Remarks {
  type Fields = Pick<Remarks, (typeof fields)[number]>;
}

/** Recognises this node kind by its own marker. */
export const isRemarks = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Remarks => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Remarks.Fields): Remarks => new Remarks(fields);
