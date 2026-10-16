import {
  Array,
  Effect,
  Option,
  Record,
  Result,
  String,
  Struct,
  pipe,
} from "effect";
import { stringify } from "yaml";

import { Analysis } from "./Analysis.js";
import * as Comment from "./Comment.js";
import * as Member from "./Member.js";
import * as Signature from "./Signature.js";
import { Site } from "./Site.js";
import { TransformError } from "./TransformError.js";

import type { Origin, Page } from "./Site.js";
import type { ApiItem } from "@microsoft/api-extractor-model";
import type { BlockContent, ListItem, PhrasingContent, Root } from "mdast";

const withLinks = Effect.fnUntraced(function* <A>(
  origin: Origin,
  effect: Effect.Effect<A, TransformError, Comment.Links>,
) {
  const site = yield* Site;
  const links = yield* site.links(origin);

  return yield* Effect.provideService(effect, Comment.Links, links);
});

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

// A child page's entry carries the first paragraph of its module's comment.
const childEntry = Effect.fnUntraced(function* (child: Page) {
  const analysis = yield* Analysis;
  const site = yield* Site;

  const file = Array.headNonEmpty(child.modules);
  const comment = yield* analysis.moduleComment(file);
  const summary = yield* Option.match(comment, {
    onNone: () => Effect.succeed([]),
    onSome: (found) =>
      withLinks(
        { module: file, container: child.container },
        Comment.lead(found),
      ),
  });
  const title: PhrasingContent = {
    type: "link",
    url: site.url(child),
    children: [{ type: "inlineCode", value: child.title }],
  };

  return {
    type: "listItem",
    spread: false,
    children: [
      {
        type: "paragraph",
        children: Array.match(summary, {
          onEmpty: () => [title],
          onNonEmpty: (lead) => [
            title,
            { type: "text", value: " — " },
            ...lead,
          ],
        }),
      },
    ],
  } satisfies ListItem;
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
  Array.match(children, {
    onEmpty: () => Effect.succeed([]),
    onNonEmpty: (pages) =>
      pipe(
        pages,
        Effect.forEach(childEntry),
        Effect.map((entries): BlockContent[] => [
          heading("Namespaces"),
          { type: "list", ordered: false, spread: false, children: entries },
        ]),
      ),
  });

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

  return {
    type: "root",
    children: [
      { type: "yaml", value: String.trimEnd(stringify({ title: page.title })) },
      ...Array.flatten(body),
    ],
  } satisfies Root;
});
