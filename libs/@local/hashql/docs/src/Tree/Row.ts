import type * as AST from "../AST/index.js";
import type * as Export from "./Export.js";
import type * as Member from "./Member.js";
import type * as Node from "./Node.js";
import type * as Prose from "./Prose.js";
import type { Array, Option } from "effect";

/** What a row links to: the declaration or member a reference names, or a trait's explanation on the traits page. */
export type Target =
  | {
      readonly _tag: "Reference";
      readonly target: AST.Reference.Reference.Target;
    }
  | {
      readonly _tag: "Trait";
      readonly trait: AST.Reference.Reference.Target;
    };

/** The kind of entry a row names, which the output shows beside it. */
export type Kind = Export.Kind | Member.Member["type"] | "trait";

/** One row of an index, which names what it links to and shows the first sentence of its documentation. */
export interface Row extends Node.Node<"row", Target> {
  readonly kind: Kind;
  /** The names a reader sees, outermost first, which an output joins with `.`. Another page's export is prefixed with its module's name. */
  readonly label: Array.NonEmptyReadonlyArray<string>;
  /** How deep the row is under another, such as a member under its interface. */
  readonly depth: number;
  /** The prose the row summarises, of which it shows the first sentence. */
  readonly summary: Option.Option<readonly Prose.Block[]>;
  readonly deprecated: boolean;
}

/** The exports related to one. The groups are a closed set, so their headings are the output's. */
export interface Related {
  readonly traits: readonly Row[];
  readonly implementedBy: readonly Row[];
  readonly acceptedBy: readonly Row[];
  readonly returnedBy: readonly Row[];
}
