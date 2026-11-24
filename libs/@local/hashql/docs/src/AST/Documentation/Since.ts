import { Array, Equal, Hash, Predicate } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlock } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Since";

const fields = ["node", "version"] as const;

/** The `@since` block, which names the release that introduced the declaration. */
export class Since implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Since" as const;

  readonly node: DocBlock;
  /** The block's single word, as written. */
  readonly version: string;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Since.prototype, Traits.Prototype);
  }

  constructor({ node, version }: Since.Fields) {
    this.node = Equal.byReferenceUnsafe(node);
    this.version = version;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return Hash.structureKeys(this, ["_tag", ...fields]);
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isSince(other) &&
      Array.every(fields, (field) => Equal.equals(this[field], other[field]))
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      version: this.version,
    };
  }
}

export declare namespace Since {
  type Fields = Pick<Since, (typeof fields)[number]>;
}

/** Recognises this node kind by its own marker. */
export const isSince = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Since => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Since.Fields): Since => new Since(fields);
