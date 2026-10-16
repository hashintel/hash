import { Array, Effect, Option, Record, Result, Struct, pipe } from "effect";

import { Analysis } from "./Analysis.js";
import * as Comment from "./Comment.js";
import * as Listing from "./Listing.js";
import * as Member from "./Member.js";
import * as Signature from "./Signature.js";
import { Site, withLinks } from "./Site.js";
import { TransformError } from "./TransformError.js";

import type { Page } from "./Site.js";
import type { ApiItem } from "@microsoft/api-extractor-model";
import type { BlockContent, Root } from "mdast";

// The modules' own comments open the page, each linking from its module.
const overview = Effect.fnUntraced(function* (page: Page) {
  const analysis = yield* Analysis;

  return yield* pipe(
    page.modules,
    Effect.forEach((file) =>
      pipe(
        file,
        analysis.moduleComment,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.succeed([]),
            onSome: (comment) =>
              withLinks(
                { module: file, container: page.container },
                Comment.overview(comment),
              ),
          }),
        ),
      ),
    ),
    Effect.map(Array.flatten),
  );
});

const member = Effect.fnUntraced(function* (
  page: Page,
  items: Array.NonEmptyReadonlyArray<ApiItem>,
) {
  const analysis = yield* Analysis;
  const site = yield* Site;

  const first = Array.headNonEmpty(items);
  const origin = yield* pipe(
    first,
    site.origin,
    Effect.fromOption,
    Effect.mapError(() =>
      TransformError.malformedAnalysis(
        `${first.getScopedNameWithinPackage()} has no source module on a page`,
      ),
    ),
  );
  const declaration = yield* analysis.declarationOf(origin.module);
  const signature = yield* Signature.make({
    name: first.displayName,
    source: origin.module,
    declaration,
    root: analysis.declarationRoot,
    exporters: [origin.module, ...page.modules],
  });
  const resolve = yield* site.declarationLinks(origin, declaration);
  const blocks = yield* withLinks(
    origin,
    Member.render({
      items,
      signature: {
        code: signature.code,
        context: signature.context,
        urls: Array.map(signature.references, ({ path }) => resolve(path)),
      },
      anchor: site.anchor,
    }),
  );

  return { label: Member.group(items), blocks };
});

const heading = (value: string): BlockContent => ({
  type: "heading",
  depth: 2,
  children: [{ type: "text", value }],
});

const namespaces = (
  children: readonly Page[],
): Effect.Effect<BlockContent[], TransformError, Analysis | Site> =>
  pipe(
    Listing.namespaces(children),
    Effect.map(
      Array.match({
        onEmpty: (): BlockContent[] => [],
        onNonEmpty: (found): BlockContent[] => [
          heading("Namespaces"),
          ...found,
        ],
      }),
    ),
  );

// Rendered members under their group headings, in the groups' order.
const sections = (
  rendered: readonly {
    readonly label: string;
    readonly blocks: BlockContent[];
  }[],
): BlockContent[] =>
  pipe(
    rendered,
    Array.groupBy(Struct.get("label")),
    Record.toEntries,
    Member.sortGroups,
    Array.flatMap(([label, group]) => [
      heading(label),
      ...Array.flatMap(group, Struct.get("blocks")),
    ]),
  );

/** Builds a page from its modules' overviews and the pages of its namespaces, followed by its members grouped by category or kind. */
export const render = Effect.fnUntraced(function* (page: Page) {
  const site = yield* Site;

  const [children, items] = Array.partition(page.container.members, (item) =>
    Result.fromOption(site.pageOf(item), () => item),
  );
  // Members sharing a name render as one: overloads, or an interface merged with a namespace.
  const body = yield* Effect.all([
    overview(page),
    namespaces(children),
    pipe(
      items,
      Array.groupBy(Struct.get("displayName")),
      Record.values,
      Effect.forEach((group) => member(page, group)),
      Effect.map(sections),
    ),
  ]);

  return { type: "root", children: Array.flatten(body) } satisfies Root;
});
