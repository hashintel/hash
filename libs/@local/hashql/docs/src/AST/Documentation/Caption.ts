import { Array, Equal, Equivalence, Hash, Predicate, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocNode, DocParagraph } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Caption";

const sameNodes = Array.makeEquivalence(Equivalence.strictEqual<DocNode>());

/** An example's `<caption>`, whose prose keeps TSDoc's tree, including code spans and unresolved links. */
export class Caption implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Caption" as const;

  /** The paragraph that holds the caption's opening and closing tags. */
  readonly node: DocParagraph;
  /** The nodes between the tags. */
  readonly content: readonly DocNode[];

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Caption.prototype, Traits.Prototype);
  }

  constructor({ node, content }: Caption.Fields) {
    this.node = node;
    this.content = content;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.array(Array.map(this.content, Hash.random))),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isCaption(other) &&
      this.node === other.node &&
      sameNodes(this.content, other.content)
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      content: Array.map(this.content, DocSource.inspectNode),
    };
  }
}

export declare namespace Caption {
  type Fields = Pick<Caption, "node" | "content">;
}

/** Recognises this node kind by its own marker. */
export const isCaption = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Caption => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Caption.Fields): Caption => new Caption(fields);
