import { Data } from "effect";

import type * as AST from "../AST/index.js";
import type * as Catalogue from "../Catalogue.js";
import type * as Import from "../Import.js";
import type * as Comment from "./Comment.js";
import type * as Export from "./Export.js";
import type * as Node from "./Node.js";
import type * as Row from "./Row.js";
import type * as Trait from "./Trait.js";
import type { Option } from "effect";

/** How a module groups its exports: under the `@category` one of them names, or by what they declare. */
export type Grouping = Data.TaggedEnum<{
  Category: {
    readonly name: string;
    readonly origin: AST.Documentation.Category.Category;
  };
  Declared: {
    readonly kind: "modules" | "types" | "classes" | "functions" | "constants";
  };
}>;

export const {
  Category,
  Declared,
  $match: matchGrouping,
} = Data.taggedEnum<Grouping>();

/** The grouping's sort key, and its part of an anchor: a category's name in lower case with each run of other characters as `-`, or the kind of declaration. */
export const slugOf: (grouping: Grouping) => string = matchGrouping({
  Category: ({ name }) => name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-"),
  Declared: ({ kind }) => kind,
});

/** One group of a module's exports: its rows in the module's index, and the exports this page documents. A group whose exports another page documents only links to them. */
export interface Group {
  readonly grouping: Grouping;
  readonly rows: readonly Row.Row[];
  readonly exports: readonly Export.Export[];
}

/** The page of a declaration that is only a namespace, or of an entrypoint's root, under its canonical name. */
export interface Module extends Node.Node<"module", Catalogue.Entry> {
  readonly kind: Extract<Export.Kind, "module" | "entrypoint">;
  /** The namespace the module declares, whose node locates the module in its source. */
  readonly namespace: AST.NamespaceDeclaration.NamespaceDeclaration;
  readonly comment: Option.Option<Comment.Comment>;
  readonly import: Import.Import;
  readonly groups: readonly Group[];
}

/** The reference's first page, which links to its entrypoints and its traits. */
export interface Overview extends Node.Node<"overview", Catalogue.Catalogue> {
  readonly entrypoints: readonly Row.Row[];
  readonly traits: readonly Row.Row[];
}

export type Page = Module | Trait.Traits | Overview;
