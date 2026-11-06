import { Equal, Hash, Predicate, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlock, DocSection } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Deprecated";

/** The `@deprecated` block, which says what to use instead or why the declaration is going away. */
export class Deprecated implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Deprecated" as const;

  readonly node: DocBlock;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Deprecated.prototype, Traits.Prototype);
  }

  constructor({ node }: Deprecated.Fields) {
    this.node = node;
    Object.freeze(this);
  }

  get content(): DocSection {
    return this.node.content;
  }

  [Hash.symbol](): number {
    return pipe(this._tag, Hash.string, Hash.combine(Hash.random(this.node)));
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isDeprecated(other) && this.node === other.node
    );
  }

  toJSON(): Traits.Base.Inspection {
    return { _tag: this._tag, node: DocSource.inspectNode(this.node) };
  }
}

export declare namespace Deprecated {
  type Fields = Pick<Deprecated, "node">;
}

/** Recognises this node kind by its own marker. */
export const isDeprecated = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Deprecated => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Deprecated.Fields): Deprecated =>
  new Deprecated(fields);
