import type * as AST from "../AST/index.js";
import type * as Catalogue from "../Catalogue.js";
import type * as Comment from "./Comment.js";
import type * as Hierarchy from "./Hierarchy.js";
import type * as Node from "./Node.js";
import type * as Prose from "./Prose.js";
import type * as Row from "./Row.js";
import type { Option } from "effect";

/** An interface the reference explains in place of a comment, with a guide to read further. */
export interface Explanation extends Node.Node<"explanation", Prose.Explained> {
  readonly children: readonly Prose.Paragraph[];
  readonly guide: Option.Option<URL>;
}

/** A reusable interface and the exports that implement it, by the declaration the interface is. A private or external interface is a trait too, and only a public one has an export of its own. */
export interface Trait extends Node.Node<"trait", AST.Target.Interned> {
  readonly name: string;
  /** The trait's own comment, or the reference's explanation of it. */
  readonly description: Comment.Comment | Explanation;
  readonly implementors: readonly Row.Row[];
  readonly hierarchy: Option.Option<Hierarchy.Hierarchy>;
}

/** The page of every trait, which the reference makes from its whole catalogue. */
export interface Traits extends Node.Node<"traits", Catalogue.Catalogue> {
  readonly traits: readonly Trait[];
}
