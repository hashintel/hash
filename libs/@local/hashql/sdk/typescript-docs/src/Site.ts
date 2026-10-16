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
  String,
  Struct,
  flow,
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

/** Resolves a name path, `Type` or `Type.Any`, to the URL of what it names, `None` when it names nothing on a page. */
export type Resolve = (
  path: Array.NonEmptyReadonlyArray<string>,
) => Option.Option<string>;

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
    /** Resolves names written in the declaration file emitted from an origin's module, as TypeScript resolves them there: the module's declarations, then its imports. */
    readonly declarationLinks: (
      origin: Origin,
      declaration: string,
    ) => Effect.Effect<Resolve, TransformError>;
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
    pipe(
      parent,
      Option.fromNullishOr,
      Option.map((found) => [found, found.parent] as const),
    ),
  );

const directorySegments = (path: Path.Path, directory: string): string[] =>
  pipe(directory, String.split(path.sep), Array.filter(String.isNonEmpty));

// A namespace that a module re-exports with `export * as` gets a page. A `namespace` declaration renders among its siblings.
const pageOfNamespace = Effect.fnUntraced(function* (item: ApiItem) {
  const analysis = yield* Analysis;
  const sources = yield* Sources;
  const path = yield* Path.Path;

  const file = analysis.sourceOf(item);
  if (item.kind !== ApiItemKind.Namespace || Option.isNone(file)) {
    return Option.none<Page>();
  }

  const { namespaces } = yield* sources.scope(file.value);
  const specifier = Record.get(namespaces, item.displayName);
  if (Option.isNone(specifier)) {
    return Option.none<Page>();
  }

  const target = yield* pipe(
    sources.resolve(file.value, specifier.value),
    Effect.fromOption,
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

  return Option.some<Page>({
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
      pipe(
        item,
        pageOfNamespace,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed(Array.empty<Page>()),
            onSome: (page) =>
              pipe(item, discover, Effect.map(Array.prepend(page))),
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
    Array.map(pages, (page) => [page.container, page] as const),
  );
  const byModule = pipe(
    pages,
    Array.flatMap((page) =>
      Array.map(page.modules, (file) => [file, page] as const),
    ),
    Record.fromEntries,
  );
  const hasPage = (item: ApiItem): boolean => byContainer.has(item);

  const pageOf = (container: ApiItem): Option.Option<Page> =>
    Option.fromNullishOr(byContainer.get(container));
  const pageUrl = (page: Page): string => Array.join([url, ...page.path], "/");
  const enclosing = (item: ApiItem): Option.Option<ApiItem> =>
    pipe(item, ancestors, Array.findFirst(hasPage));
  const anchor = (item: ApiItem): string =>
    pipe(
      item,
      ancestors,
      Array.takeWhile((parent) => !hasPage(parent)),
      Array.reverse,
      Array.map(Struct.get("displayName")),
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
      pipe(
        item,
        pageOf,
        Option.map(pageUrl),
        Option.orElse(() =>
          pipe(
            item,
            enclosing,
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

/** The declarations a name may refer to in one scope, empty when the scope has none. */
type Lookup = (name: string) => readonly ApiItem[];

// The module's declarations, including those it publishes under another name with `export { local as name }`.
const declared =
  ({ origin, scope }: Resolution): Lookup =>
  (name) => [
    ...members(origin.container, name),
    ...pipe(
      scope.reexports,
      Record.toEntries,
      Array.filter(
        ([, { local, specifier }]) =>
          local === name && Option.isNone(specifier),
      ),
      Array.flatMap(([exported]) => members(origin.container, exported)),
    ),
  ];

// Specifiers resolve from the origin's module, which the emitted declaration files mirror.
const imported =
  (sources: Sources["Service"], { index, origin, scope }: Resolution): Lookup =>
  (name) =>
    pipe(
      scope.imports,
      Record.get(name),
      Option.flatMap(({ specifier, imported: exported }) =>
        pipe(
          sources.resolve(origin.module, specifier),
          Option.flatMap(index.pageOfModule),
          Option.map(({ container }) =>
            Option.match(exported, {
              onNone: () => [container],
              onSome: (member) => members(container, member),
            }),
          ),
        ),
      ),
      Option.getOrElse(Array.empty),
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
    Option.filter(Array.isReadonlyArrayNonEmpty<string>),
  );

// The first scope that declares the leading name decides it, and the remaining names walk the members of every declaration found there.
const resolveIn =
  (lookups: readonly Lookup[]) =>
  ([
    head,
    ...tail
  ]: Array.NonEmptyReadonlyArray<string>): Option.Option<ApiItem> =>
    pipe(
      lookups,
      Array.findFirst((lookup) =>
        Option.liftPredicate(
          lookup(head),
          Array.isReadonlyArrayNonEmpty<ApiItem>,
        ),
      ),
      Option.map((found: readonly ApiItem[]) =>
        Array.reduce(tail, found, (candidates, name) =>
          Array.flatMap(candidates, (parent) => members(parent, name)),
        ),
      ),
      Option.flatMap(Array.head),
    );

const makeLinks = Effect.fnUntraced(function* (index: Index, origin: Origin) {
  const analysis = yield* Analysis;
  const sources = yield* Sources;
  const path = yield* Path.Path;

  const scope = yield* sources.scope(origin.module);
  const resolution: Resolution = { index, origin, scope };
  // Links resolve the way TypeScript resolves them in the comment's module. A reference qualified from the package resolves last.
  const fromPackage: Lookup = (name) => members(analysis.entry, name);
  const target = resolveIn([
    declared(resolution),
    imported(sources, resolution),
    fromPackage,
  ]);
  const shown = path.relative(
    path.dirname(Array.headNonEmpty(analysis.roots)),
    origin.module,
  );

  return Links.of({
    resolve: (reference) =>
      pipe(
        reference,
        Option.liftPredicate(
          ({ packageName }) =>
            packageName === undefined || packageName === analysis.package.name,
        ),
        Option.flatMap(namesOf),
        Option.flatMap(target),
        Option.flatMap(index.itemUrl),
        Option.match({
          onNone: () =>
            pipe(
              Effect.logWarning(
                `Unresolved link ${reference.emitAsTsdoc()} in ${shown}`,
              ),
              Effect.as(Option.none()),
            ),
          onSome: flow(Option.some, Effect.succeed),
        }),
      ),
  });
});

const makeDeclarationLinks = Effect.fnUntraced(function* (
  index: Index,
  origin: Origin,
  declaration: string,
) {
  const sources = yield* Sources;

  const scope = yield* sources.scope(declaration);
  const resolution: Resolution = { index, origin, scope };

  return flow(
    resolveIn([declared(resolution), imported(sources, resolution)]),
    Option.flatMap(index.itemUrl),
  ) satisfies Resolve;
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

      const pages = yield* pipe(
        analysis.entry,
        discover,
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
        pages,
        Array.groupBy((page) => Array.join(page.path, "/")),
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
          pipe(
            item,
            analysis.sourceOf,
            Option.flatMap((module) =>
              pipe(
                module,
                index.pageOfModule,
                Option.map(Struct.get("container")),
                Option.orElse(() => index.enclosing(item)),
                Option.map((container) => ({ module, container })),
              ),
            ),
          ),
        links: (origin) => Effect.provide(makeLinks(index, origin), services),
        declarationLinks: (origin, declaration) =>
          Effect.provide(
            makeDeclarationLinks(index, origin, declaration),
            services,
          ),
      });
    }),
  );
