import { DocCodeSpan, DocLinkTag, DocParagraph } from "@microsoft/tsdoc";
import { Array, Option, Result, pipe } from "effect";

import * as DocumentationError from "./DocumentationError.js";
import * as Hierarchy from "./Hierarchy.js";
import * as DocSource from "./internal/ast/doc-source.js";
import * as LinkLookup from "./internal/link-lookup.js";
import * as Parts from "./internal/parts.js";
import * as Trait from "./Trait.js";

import type * as AST from "./AST/index.js";
import type * as Catalogue from "./Catalogue.js";
import type { DocNode } from "@microsoft/tsdoc";

/** The nodes `refinement` selects, without descending into a selected node. */
const outermost =
  <A extends DocNode>(refinement: (node: DocNode) => node is A) =>
  (node: DocNode): readonly A[] => {
    if (refinement(node)) {
      return [node];
    }

    return Array.flatMap(node.getChildNodes(), outermost(refinement));
  };

const paragraphsIn = outermost(
  (node): node is DocParagraph => node instanceof DocParagraph,
);

/** Everything a reader sees. Private remarks are left out. */
const publicProse = ({
  source,
}: AST.Documentation.Documentation): readonly DocNode[] =>
  Array.filter(
    source.getChildNodes(),
    (node) => node !== source.privateRemarks,
  );

/** A node with a comment of its own. */
interface Commented {
  readonly documentation: Option.Option<AST.Documentation.Interned>;
}

/** A part's declaration and the calls it numbers each carry their own comment. */
const commentedOf = (part: Parts.Part): readonly Commented[] => [
  part.source,
  ...part.calls,
];

/** A comment a page shows, with the public name below which its names resolve, or none for a comment no export's page shows. */
interface Owned {
  readonly owner: Option.Option<Catalogue.Name>;
  readonly documentation: AST.Documentation.Documentation;
}

/** A comment of an export, with the public name of the page that shows it. */
interface Shown {
  readonly owner: Catalogue.Name;
  readonly documentation: AST.Documentation.Interned;
}

/** The comments of `commented`, which the page of `owner` shows. */
const shownBy =
  (owner: Catalogue.Name) =>
  (commented: readonly Commented[]): readonly Shown[] =>
    Array.flatMap(commented, ({ documentation }) =>
      Option.toArray(
        Option.map(documentation, (id) => ({ owner, documentation: id })),
      ),
    );

/** The comments an export's pages show, which are those of its namespace, its declarations, their calls and its members. */
const commentsOf = (
  catalogue: Catalogue.Catalogue,
  entry: Catalogue.Entry,
): readonly Owned[] => {
  const { ast } = catalogue;
  const parts = Parts.of(ast, entry);

  return pipe(
    ast.get(entry.id).namespace,
    Option.map(ast.get),
    Option.toArray<Commented>,
    shownBy(entry.name),
    Array.appendAll(
      Array.flatMap(parts, (part) =>
        shownBy(
          LinkLookup.ownerOf(catalogue, { entry, node: part.source.node }),
        )(commentedOf(part)),
      ),
    ),
    Array.appendAll(
      pipe(
        Parts.members(parts, { ast, entry }),
        Array.flatMap((member) => Array.flatMap(member.parts, commentedOf)),
        shownBy(entry.name),
      ),
    ),
    Array.dedupe,
    Array.map(({ owner, documentation }) => ({
      owner: Option.some(owner),
      documentation: ast.get(documentation),
    })),
  );
};

/** The comments of the traits no export owns, which the traits page shows. */
const privateTraits = (
  catalogue: Catalogue.Catalogue,
): readonly AST.Documentation.Documentation[] =>
  pipe(
    Hierarchy.collect(catalogue).vertices,
    Array.filter(({ entry }) => Option.isNone(entry)),
    Array.flatMap(({ trait }) => Option.toArray(trait)),
    Array.flatMap(
      Trait.match({
        Declared: ({ documentation }) => [documentation],
        Explained: () => [],
      }),
    ),
  );

/**
 * The first code span in `paragraph` that mentions a public API no earlier link in the paragraph points to.
 *
 * A reader follows the first mention of an API, so that mention must be the link. Later spans may repeat the name plainly.
 */
const unlinkedName = (
  scope: LinkLookup.Scope,
  paragraph: DocParagraph,
): Option.Option<DocCodeSpan> =>
  Array.findFirst(paragraph.nodes, (node, index) => {
    if (!(node instanceof DocCodeSpan)) {
      return Option.none();
    }

    const { ast } = scope.catalogue;
    const linked = pipe(
      Array.take(paragraph.nodes, index),
      Array.filter((earlier) => earlier instanceof DocLinkTag),
      Array.flatMap((link) => Option.toArray(ast.nameOf(link))),
      Array.map(({ target }) => ast.idOf(target)),
    );

    return pipe(
      LinkLookup.mentioned(scope)(node.code),
      Option.liftPredicate(
        (mentions) =>
          mentions.length > 0 &&
          !Array.some(mentions, (mention) => linked.includes(mention)),
      ),
      Option.as(node),
    );
  });

/**
 * Checks that every comment a page shows links each public API where a paragraph first names it.
 *
 * A name is looked up below the public name of the export whose page shows the comment, then in each enclosing namespace outwards.
 *
 * A private trait's comment has no such export, so a name in it may mean any export whose path ends with it.
 */
export const check = (
  catalogue: Catalogue.Catalogue,
): Result.Result<void, DocumentationError.DocumentationError> => {
  const owned = pipe(
    catalogue.entries,
    Array.flatMap((entry) => commentsOf(catalogue, entry)),
    Array.appendAll(
      Array.map(privateTraits(catalogue), (documentation): Owned => ({
        owner: Option.none(),
        documentation,
      })),
    ),
  );

  for (const { owner, documentation } of owned) {
    const scope = { catalogue, owner };

    const unlinked = Array.findFirst(
      Array.flatMap(publicProse(documentation), paragraphsIn),
      (paragraph) => unlinkedName(scope, paragraph),
    );

    if (Option.isSome(unlinked)) {
      return Result.fail(
        DocumentationError.DocumentationError.make({
          file: documentation.node.getSourceFile().fileName,
          reason: {
            _tag: "UnlinkedName",
            code: unlinked.value.code,
            start: Option.match(DocSource.rangeOf(unlinked.value), {
              onNone: () => documentation.node.pos,
              onSome: ({ pos }) => pos,
            }),
          },
        }),
      );
    }
  }

  return Result.void;
};
