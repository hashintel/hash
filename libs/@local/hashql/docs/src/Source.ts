// oxlint-disable typescript/promise-function-async -- Effect owns execution until the host's Promise boundary.
// oxlint-disable import/max-dependencies -- Source is the aggregation of all dependencies.
import * as NodeServices from "@effect/platform-node/NodeServices";
import {
  Array,
  Data,
  Effect,
  Function,
  Layer,
  Match,
  Path,
  Result,
  String,
  Struct,
  pipe,
} from "effect";

import * as Generation from "./Generation.js";
import * as Page from "./Page.js";
import * as TypeScript from "./TypeScript/index.js";

import type * as Tree from "./Tree/index.js";
import type {
  StructuredData,
  StructuredDataContent,
} from "fumadocs-core/mdx-plugins";
import type {
  MetaData,
  PageData,
  StaticSource,
  VirtualFile,
} from "fumadocs-core/source";
import type { TOCItemType } from "fumadocs-core/toc";
import type { Root } from "hast";
import type {
  HeadingData,
  Root as MdastRoot,
  PhrasingContent,
  RootContent,
} from "mdast";

/** A heading in a page's outline. A heading that names an entry carries the entry's kind, for a host that draws it as the page does. */
export interface OutlineEntry extends TOCItemType {
  readonly kind?: Tree.Row.Kind | undefined;
}

/** A page whose body is hast, with what a docs host lists and searches it by. */
export interface HastPage {
  /** The page's file below its directory, such as `hashql/JExpr/Ident.html`. A link to another page is relative to this file. */
  readonly file: string;
  readonly title: string;
  readonly description: string;
  /** The headings the page draws, for its outline. */
  readonly toc: OutlineEntry[];
  /** The page's headings and text, which search indexes. */
  readonly structuredData: StructuredData;
  readonly hast: Root;
  /** The page as Markdown, for readers and tools that take text. */
  readonly markdown: string;
}

/** The data of a page that {@link withHast} adds to a source. */
export interface HastPageData extends Omit<HastPage, "file"> {}

/** Pages of hast, with the folders that order them in a host's navigation. */
export interface HastPages {
  readonly pages: readonly HastPage[];
  readonly folders: readonly Page.Folder[];
}

/** Pages of hast, and the directory below the source's root that they go in. */
export interface Mount {
  readonly dir: string;
  readonly load: () => Promise<HastPages>;
}

/** A loaded page, as a file of the source below `dir`. */
const pageFileOf =
  (dir: string) =>
  (
    page: HastPage,
  ): VirtualFile<{
    pageData: HastPageData;
    metaData: MetaData;
  }> => ({
    type: "page",
    path: pipe(
      [dir, page.file],
      Array.filter(String.isNonEmpty),
      Array.join("/"),
    ),
    data: Struct.omit(page, ["file"]),
  });

/** A loaded folder, as the `meta.json` below `dir` that orders it. */
const metaFileOf =
  (dir: string) =>
  ({
    directory,
    pages,
  }: Page.Folder): VirtualFile<{
    pageData: HastPageData;
    metaData: MetaData;
  }> => ({
    type: "meta",
    path: pipe(
      [dir, directory, "meta.json"],
      Array.filter(String.isNonEmpty),
      Array.join("/"),
    ),
    data: { pages: Array.copy(pages) },
  });

/**
 * Adds the pages each mount loads to `source`, each below its mount's directory, and a `meta.json` for each of its folders.
 *
 * A host draws such a page with `Body`, resolving its links with the loader's `resolveHref`, and tells it from the source's own pages by its `hast`.
 */
export const withHast: {
  (
    mounts: readonly Mount[],
  ): <Data extends PageData, Meta extends MetaData>(
    source: StaticSource<{ pageData: Data; metaData: Meta }>,
  ) => Promise<
    StaticSource<{ pageData: Data | HastPageData; metaData: Meta | MetaData }>
  >;
  <Data extends PageData, Meta extends MetaData>(
    source: StaticSource<{ pageData: Data; metaData: Meta }>,
    mounts: readonly Mount[],
  ): Promise<
    StaticSource<{ pageData: Data | HastPageData; metaData: Meta | MetaData }>
  >;
} = Function.dual(
  2,
  <Data extends PageData, Meta extends MetaData>(
    source: StaticSource<{ pageData: Data; metaData: Meta }>,
    mounts: readonly Mount[],
  ): Promise<
    StaticSource<{ pageData: Data | HastPageData; metaData: Meta | MetaData }>
  > =>
    pipe(
      mounts,
      Effect.forEach(
        ({ dir, load }) =>
          pipe(
            Effect.promise(load),
            Effect.map(({ pages, folders }) =>
              Array.appendAll(
                Array.map(pages, pageFileOf(dir)),
                Array.map(folders, metaFileOf(dir)),
              ),
            ),
          ),
        { concurrency: "unbounded" },
      ),
      Effect.map((loaded) =>
        Struct.assign(source, {
          files: Array.appendAll(source.files, Array.flatten(loaded)),
        }),
      ),
      Effect.runPromise,
    ),
);

/** A heading or a block of text on a page, in the order the page shows them. */
type Block = Data.TaggedEnum<{
  Heading: {
    readonly id: string;
    readonly depth: number;
    readonly title: string;
    readonly kind: HeadingData["kind"];
  };
  Text: { readonly content: string };
}>;

const Block = Data.taggedEnum<Block>();

const text = (nodes: readonly PhrasingContent[]): string =>
  pipe(
    nodes,
    Array.map(
      Match.type<PhrasingContent>().pipe(
        Match.discriminator("type")("text", "inlineCode", ({ value }) => value),
        Match.when({ children: Match.any }, ({ children }) => text(children)),
        Match.orElse(() => ""),
      ),
    ),
    Array.join(""),
  );

const blocksOf: (nodes: readonly RootContent[]) => Block[] = Array.flatMap(
  Match.type<RootContent>().pipe(
    Match.discriminator("type")("heading", ({ depth, children, data }) => {
      const { id } = data?.hProperties ?? {};
      if (typeof id !== "string") {
        return [];
      }

      return [
        Block.Heading({
          id,
          depth,
          title: text(children),
          kind: data?.kind,
        }),
      ];
    }),
    Match.discriminator("type")("paragraph", ({ children }) => [
      Block.Text({ content: text(children) }),
    ]),
    Match.discriminator("type")("code", ({ value }) => [
      Block.Text({ content: value }),
    ]),
    Match.when({ children: Match.any }, ({ children }) => blocksOf(children)),
    Match.orElse(() => []),
  ),
);

/** A page's outline and the data search indexes, from its headings and text. */
const outlineOf = (
  tree: MdastRoot,
): Pick<HastPage, "toc" | "structuredData"> => {
  const blocks = blocksOf(tree.children);
  const headings = Array.filter(blocks, Block.$is("Heading"));
  // Each text block belongs to the heading above it.
  const [, contents] = Array.mapAccum(
    blocks,
    undefined,
    (
      heading: string | undefined,
      block,
    ): readonly [string | undefined, readonly StructuredDataContent[]] =>
      Block.$match(block, {
        Heading: ({ id }) => [id, []] as const,
        Text: ({ content }) => [heading, [{ heading, content }]] as const,
      }),
  );

  return {
    toc: Array.map(headings, ({ id, depth, title, kind }) => ({
      title,
      url: `#${id}`,
      depth,
      kind,
    })),
    structuredData: {
      headings: Array.map(headings, ({ id, title }) => ({
        id,
        content: title,
      })),
      contents: Array.flatten(contents),
    },
  };
};

const hastPageOf = (page: Page.Page): Result.Result<HastPage, Page.Failure> =>
  Result.all({
    tree: Page.toMdast(page),
    hast: Page.toHast(page),
    markdown: Page.toMarkdown(page),
  }).pipe(
    Result.map(({ tree, hast, markdown }) =>
      Struct.assign(outlineOf(tree), {
        file: page.file,
        title: Page.title(page),
        description: Page.description(page),
        hast,
        markdown,
      }),
    ),
  );

export interface Options extends Page.Options {
  /** Defaults to the declarations copied into this package's `.generated` directory. */
  readonly directory?: string;
}

const load = Effect.fnUntraced(function* (options: Options) {
  const path = yield* Path.Path;
  const file = yield* path.fromFileUrl(new URL(import.meta.url));
  const { pages, folders } = yield* Generation.fromDirectory({
    directory:
      options.directory ?? path.join(path.dirname(file), "..", ".generated"),
    sourceUrl: options.sourceUrl,
  });
  const written = yield* Effect.fromResult(
    Result.all(Array.map(pages, hastPageOf)),
  );
  return { pages: written, folders };
});

/** Extracts and renders the reference when the host invokes the returned loader. */
export const loader =
  (options: Options): Mount["load"] =>
  () =>
    load(options).pipe(
      // oxlint-disable-next-line effecttsgo/strict-effect-provide -- the host's entry point into the extraction
      Effect.provide(Layer.merge(TypeScript.Api.layer, NodeServices.layer)),
      Effect.runPromise,
    );
