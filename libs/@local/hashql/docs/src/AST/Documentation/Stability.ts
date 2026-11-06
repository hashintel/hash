import { Equal, Hash, Predicate, Schema, pipe } from "effect";

import * as DocSource from "../../internal/ast/doc-source.js";
import * as Traits from "../../internal/ast/traits.js";

import type { DocBlock } from "@microsoft/tsdoc";
import type { Inspectable } from "effect";

const TypeId = "~hashql-docs/AST/Documentation/Stability";

/** The release stability labels accepted by `@stability`. */
export const Level = Schema.Literals([
  "stable",
  "beta",
  "experimental",
  "unstable",
]);

export type Level = (typeof Level.literals)[number];

/** The `@stability` block, which labels how settled the declaration's API is. */
export class Stability implements Traits.Base {
  readonly [TypeId] = TypeId;
  readonly _tag = "Stability" as const;

  readonly node: DocBlock;
  readonly level: Level;

  declare readonly pipe: Traits.Base["pipe"];
  declare readonly toString: Traits.Base["toString"];
  declare readonly [Inspectable.NodeInspectSymbol]: Traits.Base[Inspectable.NodeInspectSymbol];

  static {
    Object.assign(Stability.prototype, Traits.Prototype);
  }

  constructor({ node, level }: Stability.Fields) {
    this.node = node;
    this.level = level;
    Object.freeze(this);
  }

  [Hash.symbol](): number {
    return pipe(
      this._tag,
      Hash.string,
      Hash.combine(Hash.random(this.node)),
      Hash.combine(Hash.hash(this.level)),
    );
  }

  [Equal.symbol](other: Equal.Equal): boolean {
    return (
      // oxlint-disable-next-line eslint/no-use-before-define -- The guard follows its class, and this method runs after module initialisation.
      isStability(other) &&
      this.node === other.node &&
      this.level === other.level
    );
  }

  toJSON(): Traits.Base.Inspection {
    return {
      _tag: this._tag,
      node: DocSource.inspectNode(this.node),
      level: this.level,
    };
  }
}

export declare namespace Stability {
  type Fields = Pick<Stability, "node" | "level">;
}

/** Recognises this node kind by its own marker. */
export const isStability = (
  // oxlint-disable-next-line typescript/no-restricted-types -- A node guard accepts unchecked values.
  value: unknown,
): value is Stability => Predicate.hasProperty(value, TypeId);

/** Creates a frozen node from the supplied fields. */
export const make = (fields: Stability.Fields): Stability =>
  new Stability(fields);
