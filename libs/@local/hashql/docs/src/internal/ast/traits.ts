import { Inspectable, Pipeable, Struct } from "effect";

import type * as AST from "../../AST/index.js";
import type { Equal, Option } from "effect";

/**
 * Behaviour shared by every owned node, including documentation nodes that have no source comment of their own.
 *
 * Hashing and equality use owned fields and child IDs by value, but retain compiler nodes, TSDoc nodes and symbols by object identity.
 */
export interface Base
  extends Equal.Equal, Pipeable.Pipeable, Inspectable.Inspectable {}

export declare namespace Base {
  /** Debug output includes the node kind and selected fields, never compiler or TSDoc graphs. */
  interface Inspection {
    readonly _tag: string;
    // oxlint-disable-next-line typescript/no-restricted-types -- Inspection records intentionally contain different field types for each node kind.
    readonly [field: string]: unknown;
  }
}

/** Behaviour shared by the owned source nodes, independent of their source syntax. */
export interface Traits extends Base {
  /** The node's own comment, parsed and interned in the same graph. Grouping nodes without syntax of their own have none. */
  readonly documentation: Option.Option<AST.Documentation.Interned>;
}

export declare namespace Traits {
  type Inspection = Base.Inspection;
}

/** Reuses Effect's pipe and inspection methods while leaving each node's JSON representation intact. */
export const Prototype: Pick<
  Base,
  "pipe" | "toString" | Inspectable.NodeInspectSymbol
> = Struct.assign(
  Pipeable.Prototype,
  Struct.omit(Inspectable.BaseProto, ["toJSON"]),
);
