import { Function, Match, Option, pipe } from "effect";

import * as Hast from "./internal/hast.js";
import * as Markdown from "./internal/markdown.js";
import * as Related from "./internal/related.js";
import * as Render from "./internal/render.js";
import * as Titles from "./internal/titles.js";
import * as Tree from "./Tree/index.js";

import type * as Document from "./Document.js";
import type { Result } from "effect";
import type { Root as HastRoot } from "hast";
import type { Root } from "mdast";

/** One page of the reference: its documentation tree, with its code printed, ready for an adapter to write. */
export type Page = Render.Page;

/** A directory of the reference and the order of the pages and directories in it, by name, as a host's navigation lists them. */
export type Folder = Render.Folder;

/** The reference's pages, with the folders that order them. */
export type Pages = Render.Pages;

/** What the pages need from their host and from the parser. */
export type Options = Render.Options;

/** What writing a page can fail on: code the page was not printed with. */
export type Failure = Render.Failure;

/** Prints the code of every page once, after the trees are complete. */
export const all: {
  (
    options: Options,
  ): (document: Document.Document) => ReturnType<typeof Render.render>;
  (
    document: Document.Document,
    options: Options,
  ): ReturnType<typeof Render.render>;
} = Function.dual(2, Render.render);

/** The page's title: its module's name, or the name of a page the reference makes itself. */
export const title = ({ tree }: Page): string =>
  Match.value(tree).pipe(
    Match.discriminatorsExhaustive("type")({
      module: ({ origin }) => Related.titleOf(origin),
      traits: () => "Traits",
      overview: () => "Reference",
    }),
  );

/** The page's description for search and metadata: the first paragraph of its module's comment as plain text, which the page itself shows with its code and links. */
export const description = ({ tree }: Page): string =>
  Match.value(tree).pipe(
    Match.discriminatorsExhaustive("type")({
      module: ({ comment }) =>
        pipe(
          comment,
          Option.flatMap(({ description: lead }) => lead),
          Option.flatMap(({ children }) => Tree.Prose.plain(children)),
          Option.getOrElse(() => ""),
        ),
      traits: () => Titles.descriptions.traits,
      overview: () => Titles.descriptions.overview,
    }),
  );

/** A page as MDAST, in reading order, with an id on each heading a link can target. */
export const toMdast = (page: Page): Result.Result<Root, Failure> =>
  Markdown.toMdast(page.output)(page.tree);

/** A page's body as hast, with the `api-*` elements a host draws with its own components. */
export const toHast = (page: Page): Result.Result<HastRoot, Failure> =>
  Hast.toHast(page.output)(page.tree);

/** A page as Markdown, for readers and tools that take text. Each heading and member starts with an HTML anchor carrying its id, so a link to it has a target. */
export const toMarkdown = (page: Page): Result.Result<string, Failure> =>
  Markdown.toMarkdown(page.output)({ page: page.tree, title: title(page) });
