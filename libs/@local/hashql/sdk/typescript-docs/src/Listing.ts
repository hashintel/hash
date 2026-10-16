import { Array, Effect, Match, Option, Record, Struct, pipe } from "effect";

import { Analysis } from "./Analysis.js";
import * as Comment from "./Comment.js";
import { Site, withLinks } from "./Site.js";

import type { Page } from "./Site.js";
import type { TransformError } from "./TransformError.js";
import type { PhrasingContent } from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";

// A JSX element whose attributes are all strings, rendered by one of the site's MDX components.
const element = (
  name: string,
  attributes: Record.ReadonlyRecord<string, string>,
  children: MdxJsxFlowElement["children"],
): MdxJsxFlowElement => ({
  type: "mdxJsxFlowElement",
  name,
  attributes: pipe(
    attributes,
    Record.toEntries,
    Array.map(([key, value]) => ({
      type: "mdxJsxAttribute",
      name: key,
      value,
    })),
  ),
  children,
});

const counted = (count: number, noun: string): string => {
  if (count === 1) {
    return `${count} ${noun}`;
  }

  return `${count} ${noun}s`;
};

// An entry is a link, and a reader could not follow a link inside it, so the entry keeps a link's label alone.
const unlinked: (node: PhrasingContent) => PhrasingContent[] =
  Match.type<PhrasingContent>().pipe(
    Match.discriminators("type")({
      link: ({ children }) => Array.flatMap(children, unlinked),
      linkReference: ({ children }) => Array.flatMap(children, unlinked),
      emphasis: (node) => [
        { ...node, children: Array.flatMap(node.children, unlinked) },
      ],
      strong: (node) => [
        { ...node, children: Array.flatMap(node.children, unlinked) },
      ],
      delete: (node) => [
        { ...node, children: Array.flatMap(node.children, unlinked) },
      ],
    }),
    Match.orElse((node) => [node]),
  );

// A page's entry counts the names the page documents and carries the first paragraph of its module's comment.
const pageEntry = Effect.fnUntraced(function* (page: Page) {
  const analysis = yield* Analysis;
  const site = yield* Site;

  const file = Array.headNonEmpty(page.modules);
  const comment = yield* analysis.moduleComment(file);
  const lead = yield* Option.match(comment, {
    onNone: () => Effect.succeed([]),
    onSome: (found) =>
      withLinks(
        { module: file, container: page.container },
        Comment.lead(found),
      ),
  });
  const names = pipe(
    page.container.members,
    Array.map(Struct.get("displayName")),
    Array.dedupe,
  );

  return element(
    "IndexEntry",
    {
      name: page.title,
      count: counted(names.length, "member"),
      href: site.url(page),
    },
    pipe(
      Array.flatMap(lead, unlinked),
      Option.liftPredicate(Array.isArrayNonEmpty),
      Option.match({
        onNone: () => [],
        onSome: (children) => [{ type: "paragraph", children }],
      }),
    ),
  );
});

/** Entries for a page's namespace pages, as one grid of cards. */
export const namespaces = (
  children: readonly Page[],
): Effect.Effect<MdxJsxFlowElement[], TransformError, Analysis | Site> =>
  pipe(
    Effect.forEach(children, pageEntry),
    Effect.map((found) =>
      Array.match(found, {
        onEmpty: () => [],
        onNonEmpty: (entries) => [element("Cards", {}, [...entries])],
      }),
    ),
  );
