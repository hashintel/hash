import { Equal, Hash, Predicate, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlock } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Category";

/** The `@category` block, which names the group a module's index lists the declaration under. */
export class Category implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Category" as const;

  readonly node: DocBlock;
  /** The block's text, as written. */
  readonly name: string;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Category.prototype, Traits.Prototype);
  }

  constructor({ node, name }: Category.Fields) {
    this.node = node;
    this.name = name;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.name)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isCategory(other) && this.node === other.node && this.name === other.name
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

export declare namespace Category {
  type Fields = Pick<Category, "node" | "name">;
}

/** Recognises this node kind by its own marker. */
export const isCategory = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Category => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Category.Fields): Category => new Category(fields);
