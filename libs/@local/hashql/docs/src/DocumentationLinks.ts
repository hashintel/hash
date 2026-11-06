import { DocCodeSpan, DocLinkTag, DocParagraph } from "@microsoft/tsdoc";
import { Array, Option, Result, pipe } from "effect";

import * as DocumentationError from "./DocumentationError.js";
import * as DocSource from "./internal/ast/doc-source.js";
import * as LinkLookup from "./internal/link-lookup.js";
import * as Parts from "./internal/parts.js";

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

/** The comments an export's page shows: its namespace's, its declarations' and calls', and its members'. */
const commentsOf = (
  catalogue: Catalogue.Catalogue,
  entry: Catalogue.Entry,
): readonly AST.Documentation.Documentation[] => {
  const { ast } = catalogue;
  const parts = Parts.of(ast, entry);

  return pipe(
    ast.get(entry.id).namespace,
    Option.map(ast.get),
    Option.toArray<Commented>,
    Array.appendAll(Array.flatMap(parts, commentedOf)),
    Array.appendAll(
      pipe(
        Parts.members(parts, { ast, entry }),
        Array.flatMap((member) => Array.flatMap(member.parts, commentedOf)),
      ),
    ),
    Array.flatMap(({ documentation }) => Option.toArray(documentation)),
    Array.dedupe,
    Array.map(ast.get),
  );
};

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
 */
export const check = (
  catalogue: Catalogue.Catalogue,
): Result.Result<void, DocumentationError.DocumentationError> => {
  for (const entry of catalogue.entries) {
    const scope = { catalogue, owner: Option.some(entry.name) };

    for (const documentation of commentsOf(catalogue, entry)) {
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
  }

  return Result.void;
};
