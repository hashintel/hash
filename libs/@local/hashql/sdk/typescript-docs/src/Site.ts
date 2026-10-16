import {
  ApiItemContainerMixin,
  ApiItemKind,
} from "@microsoft/api-extractor-model";
import {
  Array,
  Context,
  Effect,
  Layer,
  Option,
  Path,
  Record,
  pipe,
} from "effect";

import { Analysis } from "./Analysis.js";
import { Links } from "./Comment.js";
import { Sources } from "./Sources.js";
import { TransformError } from "./TransformError.js";

import type { Scope } from "./Sources.js";
import type { ApiItem } from "@microsoft/api-extractor-model";
import type { DocDeclarationReference } from "@microsoft/tsdoc";

/** A reference page for the package, or for a namespace that a module re-exports with `export * as`. */
export interface Page {
  /** Path segments below the output directory, empty for the package page. */
  readonly path: readonly string[];
  readonly title: string;
  /** The model item whose members the page documents. */
  readonly container: ApiItem;
  /** The modules whose `@module` comments open the page. */
  readonly modules: Array.NonEmptyReadonlyArray<string>;
}

/** The module a comment comes from, whose imports its links see, and the item that stands for that module's declarations. */
export interface Origin {
  readonly module: string;
  readonly container: ApiItem;
}

/** The pages of the reference and the links between them. */
export class Site extends Context.Service<
  Site,
  {
    readonly pages: Array.NonEmptyReadonlyArray<Page>;
    /** The page documenting a container's members, if it has one. */
    readonly pageOf: (container: ApiItem) => Option.Option<Page>;
    readonly url: (page: Page) => string;
    /** An item's anchor on its page: its name, qualified up to the page's container. */
    readonly anchor: (item: ApiItem) => string;
    readonly origin: (item: ApiItem) => Option.Option<Origin>;
    /** Resolves the links of comments written at an origin. */
    readonly links: (
      origin: Origin,
    ) => Effect.Effect<Links["Service"], TransformError>;
  }
>()("@local/hashql-typescript-docs/Site") {}

// Every declaration sharing the name, since an interface and a namespace merge under one.
const members = (container: ApiItem, name: string): readonly ApiItem[] => {
  if (ApiItemContainerMixin.isBaseClassOf(container)) {
    return container.findMembersByName(name);
  }

  return [];
};

const ancestors = (item: ApiItem): ApiItem[] =>
  Array.unfold(item.parent, (parent) =>
    Option.fromNullishOr(parent).pipe(
      Option.map((found) => [found, found.parent] as const),
    ),
  );

const directorySegments = (path: Path.Path, directory: string): string[] =>
  pipe(
    directory.split(path.sep),
    Array.filter((segment) => segment !== ""),
  );

// A namespace that a module re-exports with `export * as` gets a page. A `namespace` declaration renders among its siblings.
const pageOfNamespace = (
  item: ApiItem,
): Effect.Effect<
  Option.Option<Page>,
  TransformError,
  Analysis | Sources | Path.Path
> =>
  Effect.gen(function* () {
    const analysis = yield* Analysis;
    const sources = yield* Sources;
    const path = yield* Path.Path;
    const file = analysis
      .sourceOf(item)
      .pipe(Option.filter(() => item.kind === ApiItemKind.Namespace));

    if (Option.isNone(file)) {
      return Option.none();
    }

    const specifier = Record.get(
      (yield* sources.scope(file.value)).namespaces,
      item.displayName,
    );

    if (Option.isNone(specifier)) {
      return Option.none();
    }

    const target = yield* Effect.fromOption(
      sources.resolve(file.value, specifier.value),
    ).pipe(
      Effect.mapError(() =>
        TransformError.malformedAnalysis(
          `${file.value} re-exports ${specifier.value}, which does not exist`,
        ),
      ),
    );
    const directory = path.relative(
      path.dirname(Array.headNonEmpty(analysis.roots)),
      path.dirname(target),
    );

    return Option.some({
      path: [...directorySegments(path, directory), item.displayName],
      title: item.displayName,
      container: item,
      modules: [target],
    });
  });

const discover = (
  container: ApiItem,
): Effect.Effect<Page[], TransformError, Analysis | Sources | Path.Path> =>
  pipe(
    container.members,
    Effect.forEach((item) =>
      pageOfNamespace(item).pipe(
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed([]),
            onSome: (page) =>
              discover(item).pipe(Effect.map((nested) => [page, ...nested])),
          }),
        ),
      ),
    ),
    Effect.map(Array.flatten),
  );

interface Index {
  readonly pageOf: (container: ApiItem) => Option.Option<Page>;
  readonly pageOfModule: (file: string) => Option.Option<Page>;
  readonly url: (page: Page) => string;
  readonly anchor: (item: ApiItem) => string;
  readonly itemUrl: (item: ApiItem) => Option.Option<string>;
  /** The nearest ancestor of an item that has a page. */
  readonly enclosing: (item: ApiItem) => Option.Option<ApiItem>;
}

const makeIndex = (pages: readonly Page[], url: string): Index => {
  const byContainer = new Map(
    pipe(
      pages,
      Array.map((page) => [page.container, page] as const),
    ),
  );
  const byModule = pipe(
    pages,
    Array.flatMap((page) =>
      pipe(
        page.modules,
        Array.map((file) => [file, page] as const),
      ),
    ),
    Record.fromEntries,
  );
  const hasPage = (item: ApiItem): boolean => byContainer.has(item);

  const pageOf = (container: ApiItem): Option.Option<Page> =>
    Option.fromNullishOr(byContainer.get(container));
  const pageUrl = (page: Page): string =>
    pipe([url, ...page.path], Array.join("/"));
  const enclosing = (item: ApiItem): Option.Option<ApiItem> =>
    pipe(ancestors(item), Array.findFirst(hasPage));
  const anchor = (item: ApiItem): string =>
    pipe(
      ancestors(item),
      Array.takeWhile((parent) => !hasPage(parent)),
      Array.reverse,
      Array.map((parent) => parent.displayName),
      Array.append(item.displayName),
      Array.join("."),
    );

  return {
    pageOf,
    pageOfModule: (file) => Record.get(byModule, file),
    url: pageUrl,
    anchor,
    enclosing,
    itemUrl: (item) =>
      pageOf(item).pipe(
        Option.map(pageUrl),
        Option.orElse(() =>
          enclosing(item).pipe(
            Option.flatMap(pageOf),
            Option.map((page) => `${pageUrl(page)}#${anchor(item)}`),
          ),
        ),
      ),
  };
};

interface Resolution {
  readonly index: Index;
  readonly origin: Origin;
  readonly scope: Scope;
}

// The module's declarations, including those it publishes under another name with `export { local as name }`.
const declared = (
  { origin, scope }: Resolution,
  name: string,
): readonly ApiItem[] => [
  ...members(origin.container, name),
  ...pipe(
    Record.toEntries(scope.reexports),
    Array.filter(
      ([, reexport]) =>
        reexport.local === name && Option.isNone(reexport.specifier),
    ),
    Array.flatMap(([exported]) => members(origin.container, exported)),
  ),
];

const imported = (
  sources: Sources["Service"],
  { index, origin, scope }: Resolution,
  name: string,
): readonly ApiItem[] =>
  pipe(
    Record.get(scope.imports, name),
    Option.flatMap((binding) =>
      sources.resolve(origin.module, binding.specifier).pipe(
        Option.flatMap(index.pageOfModule),
        Option.map((page) =>
          Option.match(binding.imported, {
            onNone: () => [page.container],
            onSome: (exported) => members(page.container, exported),
          }),
        ),
      ),
    ),
    Option.getOrElse(() => []),
  );

// A symbol reference such as `[Symbol.iterator]` names no member a page lists.
const namesOf = (
  reference: DocDeclarationReference,
): Option.Option<Array.NonEmptyReadonlyArray<string>> =>
  pipe(
    reference.memberReferences,
    Array.map((part) =>
      Option.fromNullishOr(part.memberIdentifier?.identifier),
    ),
    Option.all,
    Option.flatMap(
      Array.match({
        onEmpty: () => Option.none(),
        onNonEmpty: (names) => Option.some(names),
      }),
    ),
  );

// Walks the remaining names of a reference through the members of every candidate.
const walk = (
  candidates: readonly ApiItem[],
  names: readonly string[],
): readonly ApiItem[] =>
  Array.matchLeft(names, {
    onEmpty: () => candidates,
    onNonEmpty: (name, rest) =>
      walk(
        pipe(
          candidates,
          Array.flatMap((parent) => members(parent, name)),
        ),
        rest,
      ),
  });

interface Resolver {
  readonly analysis: Analysis["Service"];
  readonly sources: Sources["Service"];
  readonly resolution: Resolution;
}

// Links resolve the way TypeScript resolves them in the comment's module: its declarations, then its imports. A reference qualified from the package resolves last.
const target =
  ({ analysis, sources, resolution }: Resolver) =>
  (reference: DocDeclarationReference): Option.Option<ApiItem> =>
    pipe(
      namesOf(reference),
      Option.filter(
        () =>
          reference.packageName === undefined ||
          reference.packageName === analysis.package.name,
      ),
      Option.flatMap(([head, ...tail]) =>
        pipe(
          [
            declared(resolution, head),
            imported(sources, resolution, head),
            members(analysis.entry, head),
          ],
          Array.findFirst((found) => found.length > 0),
          Option.map((found) => walk(found, tail)),
          Option.flatMap(Array.head),
        ),
      ),
    );

const makeLinks =
  (index: Index) =>
  (
    origin: Origin,
  ): Effect.Effect<
    Links["Service"],
    TransformError,
    Analysis | Sources | Path.Path
  > =>
    Effect.gen(function* () {
      const analysis = yield* Analysis;
      const sources = yield* Sources;
      const path = yield* Path.Path;
      const resolution: Resolution = {
        index,
        origin,
        scope: yield* sources.scope(origin.module),
      };
      const shown = path.relative(
        path.dirname(Array.headNonEmpty(analysis.roots)),
        origin.module,
      );

      return Links.of({
        resolve: (reference) => {
          const resolved = target({ analysis, sources, resolution })(
            reference,
          ).pipe(Option.flatMap(index.itemUrl));

          if (Option.isNone(resolved)) {
            return Effect.logWarning(
              `Unresolved link ${reference.emitAsTsdoc()} in ${shown}`,
            ).pipe(Effect.as(resolved));
          }

          return Effect.succeed(resolved);
        },
      });
    });

export interface Options {
  /** The URL of the package page, which every other page's URL extends. */
  readonly url: string;
}

export const layer = ({
  url,
}: Options): Layer.Layer<
  Site,
  TransformError,
  Analysis | Sources | Path.Path
> =>
  Layer.effect(
    Site,
    Effect.gen(function* () {
      const analysis = yield* Analysis;
      const services = yield* Effect.context<Analysis | Sources | Path.Path>();
      const pages = yield* discover(analysis.entry).pipe(
        Effect.map(
          Array.prepend<Page>({
            path: [],
            title: analysis.package.displayName,
            container: analysis.entry,
            modules: analysis.roots,
          }),
        ),
      );
      const duplicate = pipe(
        Array.groupBy(pages, (page) => pipe(page.path, Array.join("/"))),
        Record.toEntries,
        Array.findFirst(([, group]) => group.length > 1),
      );

      if (Option.isSome(duplicate)) {
        return yield* TransformError.malformedAnalysis(
          `Two namespaces render to ${duplicate.value[0]}`,
        );
      }

      const index = makeIndex(pages, url);

      return Site.of({
        pages,
        pageOf: index.pageOf,
        url: index.url,
        anchor: index.anchor,
        origin: (item) =>
          analysis.sourceOf(item).pipe(
            Option.flatMap((file) =>
              index.pageOfModule(file).pipe(
                Option.map((page) => page.container),
                Option.orElse(() => index.enclosing(item)),
                Option.map((container) => ({ module: file, container })),
              ),
            ),
          ),
        links: (origin) =>
          makeLinks(index)(origin).pipe(Effect.provide(services)),
      });
    }),
  );
