import { Equal, Hash, Predicate, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type * as Caption from "./Caption.js";
import type { DocBlock, DocFencedCode } from "@microsoft/tsdoc";
import type { Inspectable, Option } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Example";

/** One `@example` block. It keeps its caption as prose and its code exactly as TSDoc parsed it. */
export class Example implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Example" as const;

  readonly node: DocBlock;
  readonly caption: Option.Option<Caption.Caption>;
  /** The block's only fenced code. */
  readonly fence: DocFencedCode;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Example.prototype, Traits.Prototype);
  }

  constructor({ node, caption, fence }: Example.Fields) {
    this.node = node;
    this.caption = caption;
    this.fence = fence;
    Object.freeze(this);
  }

  /** The fence's info string, empty when the fence names no language. */
  get language(): string {
    return this.fence.language;
  }

  /** The fence's code with the comment's line prefixes removed, ending at its last line rather than at the line break before the closing fence. */
  get code(): string {
    return this.fence.code.replace(/\r?\n$/u, "");
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.caption)),
      Hash.combine(Hash.random(this.fence)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isExample(other) &&
      this.node === other.node &&
      Equal.equals(this.caption, other.caption) &&
      this.fence === other.fence
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      caption: this.caption,
      fence: DocSource.inspectNode(this.fence),
      language: this.language,
    };
  }
}

export declare namespace Example {
  type Fields = Pick<Example, "node" | "caption" | "fence">;
}

/** Recognises this node kind by its own marker. */
export const isExample = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Example => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Example.Fields): Example => new Example(fields);
