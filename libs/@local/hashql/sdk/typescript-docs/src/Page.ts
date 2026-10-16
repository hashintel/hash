import { Array, Effect, Option, Record, Result, pipe } from "effect";
import { stringify } from "yaml";

import { Analysis } from "./Analysis.js";
import * as Comment from "./Comment.js";
import * as Member from "./Member.js";
import * as Signature from "./Signature.js";
import { Site } from "./Site.js";
import { TransformError } from "./TransformError.js";

import type { Page } from "./Site.js";
import type { ApiItem } from "@microsoft/api-extractor-model";
import type { BlockContent, ListItem, PhrasingContent, Root } from "mdast";

const withLinks = Effect.fnUntraced(function* <A>(
  origin: { readonly module: string; readonly container: ApiItem },
  effect: Effect.Effect<A, TransformError, Comment.Links>,
) {
  const links = yield* (yield* Site).links(origin);

  return yield* Effect.provideService(effect, Comment.Links, links);
});

// The modules' own comments open the page, each linking from its module.
const overview = (
  page: Page,
): Effect.Effect<BlockContent[], TransformError, Analysis | Site> =>
  pipe(
    page.modules,
    Effect.forEach((file) =>
      Effect.flatMap(Effect.service(Analysis), (analysis) =>
        analysis.moduleComment(file),
      ).pipe(
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

// A child page's entry carries the first paragraph of its module's comment.
const childEntry = Effect.fnUntraced(function* (child: Page) {
  const analysis = yield* Analysis;
  const site = yield* Site;
  const file = Array.headNonEmpty(child.modules);
  const summary = yield* Option.match(yield* analysis.moduleComment(file), {
    onNone: () => Effect.succeed([]),
    onSome: (comment) =>
      withLinks(
        { module: file, container: child.container },
        Comment.lead(comment),
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
  const site = yield* Site;
  const first = Array.headNonEmpty(items);
  const origin = yield* Effect.fromOption(site.origin(first)).pipe(
    Effect.mapError(() =>
      TransformError.malformedAnalysis(
        `${first.getScopedNameWithinPackage()} has no source module on a page`,
      ),
    ),
  );
  const blocks = yield* withLinks(
    origin,
    Member.render({
      items,
      signature: yield* Signature.make({
        name: first.displayName,
        source: origin.module,
        exporters: [origin.module, ...page.modules],
      }),
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
): BlockContent[] => {
  const groups = Array.groupBy(rendered, ({ label }) => label);

  return pipe(
    Member.groupOrder(Record.keys(groups)),
    Array.flatMap((label) => [
      heading(label),
      ...pipe(
        groups[label] ?? [],
        Array.flatMap(({ blocks }) => blocks),
      ),
    ]),
  );
};

/** Builds a page from its modules' overviews and the pages of its namespaces, followed by its members grouped by category or kind. */
export const render = Effect.fnUntraced(function* (page: Page) {
  const site = yield* Site;
  const [children, items] = pipe(
    page.container.members,
    Array.partition((item) =>
      Option.match(site.pageOf(item), {
        onSome: Result.succeed,
        onNone: () => Result.fail(item),
      }),
    ),
  );
  // Members sharing a name render as one: overloads, or an interface merged with a namespace.
  const body = yield* Effect.all([
    overview(page),
    namespaces(children),
    pipe(
      Array.groupBy(items, (item) => item.displayName),
      Record.values,
      Effect.forEach((group) => member(page, group)),
      Effect.map(sections),
    ),
  ]);

  return {
    type: "root",
    children: [
      { type: "yaml", value: stringify({ title: page.title }).trimEnd() },
      ...Array.flatten(body),
    ],
  } satisfies Root;
});
