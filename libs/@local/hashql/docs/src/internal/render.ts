import {
  Array,
  Effect,
  HashMap,
  Match,
  MutableHashMap,
  Option,
  pipe,
} from "effect";

import * as Destinations from "../Destinations.js";
import * as Print from "./print.js";

import type * as Anchor from "../Anchor.js";
import type * as Document from "../Document.js";
import type * as Location from "../Location.js";
import type * as Tree from "../Tree/index.js";
import type * as Output from "./output.js";

/** One page of the reference: its documentation tree, with its code printed, ready for an adapter to write. */
export interface Page {
  /**
   * The page's file below the reference's directory, such as `hashql/JExpr/Ident.html`.
   *
   * A link to another page is relative to this file, such as `./Path.html#make`, so the reference can sit anywhere in a host's docs, and the host resolves the link to the page's URL.
   */
  readonly file: Anchor.File;
  readonly tree: Tree.Page.Page;
  readonly output: Output.Output;
}

/** A directory of the reference and the order of the pages and directories in it, by name, as a host's navigation lists them. */
export interface Folder {
  readonly directory: string;
  readonly pages: readonly string[];
}

/** The reference's pages, with the folders that order them. */
export interface Pages {
  readonly pages: readonly Page[];
  readonly folders: readonly Folder[];
}

/** What the pages need from their host. */
export interface Options {
  /** The URL of a declaration's source, from where it is declared. */
  readonly sourceUrl: (location: Location.Location) => string;
}

/** What writing a page can fail on: code the page was not printed with. */
export type Failure = Output.Failure;

const fileOf = (
  destinations: Destinations.Destinations,
  tree: Tree.Page.Page,
): Anchor.File =>
  Match.value(tree).pipe(
    Match.discriminatorsExhaustive("type")({
      module: ({ origin }) =>
        HashMap.get(destinations.pages, origin.id).pipe(Option.getOrThrow),
      traits: () => destinations.traits,
      overview: () => destinations.overview,
    }),
  );

/** Each directory of `files` with the pages and directories in it, in the order the files first name them. */
const foldersOf = (files: readonly string[]): readonly Folder[] => {
  const folders = MutableHashMap.empty<string, readonly string[]>();
  for (const file of files) {
    const components = file.split("/");
    for (const [index, component] of components.entries()) {
      const directory = Array.take(components, index).join("/");
      let name = component;
      if (index === components.length - 1) {
        name = component.slice(0, -".html".length);
      }
      const existing = MutableHashMap.get(folders, directory).pipe(
        Option.getOrElse(() => []),
      );
      MutableHashMap.set(
        folders,
        directory,
        Array.dedupe(Array.append(existing, name)),
      );
    }
  }

  return Array.map(Array.fromIterable(folders), ([directory, pages]) => ({
    directory,
    pages,
  }));
};

/** Assigns every file and anchor, prints the code of every page and locates its declarations, after the trees are complete. */
export const render = Effect.fnUntraced(function* (
  document: Document.Document,
  { sourceUrl }: Options,
) {
  const destinations = yield* Effect.fromResult(Destinations.collect(document));
  const printed = yield* Print.pages(document.pages, document.catalogue.ast);
  const pages = Array.map(document.pages, (tree): Page => {
    const file = fileOf(destinations, tree);

    return {
      file,
      tree,
      output: {
        file,
        document,
        destinations,
        printed,
        source: (node) => Option.map(printed.location(node), sourceUrl),
      },
    };
  });
  const files = (type: Tree.Page.Page["type"]): readonly string[] =>
    pipe(
      pages,
      Array.filter(({ tree }) => tree.type === type),
      Array.map(({ file }) => file),
    );

  return {
    pages,
    // The overview comes first and the traits last, as the navigation lists them.
    folders: foldersOf(
      Array.flatten([files("overview"), files("module"), files("traits")]),
    ),
  } satisfies Pages;
});
