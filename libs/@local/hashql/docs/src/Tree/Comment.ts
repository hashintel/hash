import type * as AST from "../AST/index.js";
import type * as Callable from "./Callable.js";
import type * as Node from "./Node.js";
import type * as Prose from "./Prose.js";
import type { Option } from "effect";
import type { SourceFile } from "typescript/ast";

/** A comment's summary, everything before its first block. Search and metadata text are read from it, so no plain copy travels beside it. */
export interface Description extends Node.Parent<
  "description",
  AST.Documentation.Documentation,
  Prose.Block
> {}

export interface Remarks extends Node.Parent<
  "remarks",
  AST.Documentation.Remarks.Remarks,
  Prose.Block
> {}

/** What an `@deprecated` says to use instead, or why the export is going away. */
export interface Deprecation extends Node.Parent<
  "deprecation",
  AST.Documentation.Deprecated.Deprecated,
  Prose.Block
> {}

export interface See extends Node.Parent<
  "see",
  AST.Documentation.See.See,
  Prose.Block
> {}

/** A configured block without a section of its own. The set of such tags is open, so its tag is data. */
export interface Custom extends Node.Parent<
  "custom",
  AST.Documentation.CustomBlock.CustomBlock,
  Prose.Block
> {
  readonly tag: string;
}

export interface Caption extends Node.Parent<
  "caption",
  AST.Documentation.Caption.Caption,
  Prose.Phrasing
> {}

export interface Example extends Node.Node<
  "example",
  AST.Documentation.Example.Example
> {
  readonly caption: Option.Option<Caption>;
  readonly language: Option.Option<string>;
  readonly code: string;
  /** A TypeScript example's code as the AST's program compiled it, whose names find their references in the AST. */
  readonly program: Option.Option<SourceFile>;
}

export interface Since {
  readonly version: string;
  readonly origin: AST.Documentation.Since.Since;
}

export interface Stability {
  readonly level: AST.Documentation.Stability.Level;
  readonly origin: AST.Documentation.Stability.Stability;
}

/** What a comment states about its declaration besides prose. */
export interface Facts {
  readonly since: Option.Option<Since>;
  readonly stability: Option.Option<Stability>;
  /** The `@internal` modifier: the declaration is no part of the package's API, which a reader still meets in its types. */
  readonly internal: Option.Option<AST.Documentation.Modifier.Modifier>;
  readonly deprecation: Option.Option<Deprecation>;
}

/** One source comment, with the overloads of its owner that it documents. Declarations that share a comment share its documentation node. */
export interface Comment extends Node.Node<
  "comment",
  AST.Documentation.Documentation
> {
  readonly applies: Callable.Applies;
  readonly description: Option.Option<Description>;
  readonly remarks: Option.Option<Remarks>;
  readonly examples: readonly Example[];
  readonly see: readonly See[];
  readonly custom: readonly Custom[];
  readonly facts: Facts;
}
