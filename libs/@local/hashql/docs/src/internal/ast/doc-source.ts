import { DocExcerpt, DocLinkTag } from "@microsoft/tsdoc";
import { Array, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";

import type * as AST from "../../AST/index.js";
import type { DocNode, TextRange } from "@microsoft/tsdoc";

const excerptsOf = (node: DocNode): readonly DocExcerpt[] => {
  if (node instanceof DocExcerpt) {
    return [node];
  }
  return Array.flatMap(node.getChildNodes(), excerptsOf);
};

/**
 * Spans every token below a TSDoc node, in the positions of the text it was parsed from.
 *
 * A comment lists its children by kind rather than in source order, so the span takes the extremes instead of the first and last excerpt. A node that parsed no tokens has no span.
 */
export const rangeOf = (node: DocNode): Option.Option<TextRange> => {
  const ranges = pipe(
    excerptsOf(node),
    Array.filter((excerpt) => !excerpt.content.isEmpty()),
    Array.map((excerpt) => excerpt.content.getContainingTextRange()),
  );
  if (!Array.isReadonlyArrayNonEmpty(ranges)) {
    return Option.none();
  }
  const [first] = ranges;
  return Option.some(
    first.getNewRange(
      Math.min(...Array.map(ranges, ({ pos }) => pos)),
      Math.max(...Array.map(ranges, ({ end }) => end)),
    ),
  );
};

/** The opening brace's source position, where the compiler's node for the same link starts too, since TSDoc read the comment in place. */
export const startOf = (link: DocLinkTag): Option.Option<number> =>
  Option.map(rangeOf(link), ({ pos }) => pos);

/** Describes a TSDoc node by its kind and span, without following its children. */
export const inspectNode = (
  node: DocNode,
): {
  readonly kind: string;
  readonly pos?: number;
  readonly end?: number;
} =>
  Option.match(rangeOf(node), {
    onNone: () => ({ kind: node.kind }),
    onSome: ({ pos, end }) => ({ kind: node.kind, pos, end }),
  });

/** The links below `node`. A link holds no other link. */
const linksIn = (node: DocNode): readonly DocLinkTag[] => {
  if (node instanceof DocLinkTag) {
    return [node];
  }

  return Array.flatMap(node.getChildNodes(), linksIn);
};

/** The links in everything a reader of `documentation` sees. The walk skips private remarks, so their links never have to resolve. */
export const linksOf = ({
  source,
}: AST.Documentation.Documentation): readonly DocLinkTag[] =>
  pipe(
    source.getChildNodes(),
    Array.filter((node) => node !== source.privateRemarks),
    Array.flatMap(linksIn),
  );

/** The compiler's links in `comment`, its tags' text included. */
const compilerLinks = (
  comment: Syntax.JSDoc,
): readonly (
  | Syntax.JSDocLink
  | Syntax.JSDocLinkCode
  | Syntax.JSDocLinkPlain
)[] =>
  pipe(
    comment.comment,
    Array.appendAll(
      Array.flatMap(comment.tags ?? [], (tag) => tag.comment ?? []),
    ),
    Array.filter(
      (node) =>
        Syntax.isJSDocLink(node) ||
        Syntax.isJSDocLinkCode(node) ||
        Syntax.isJSDocLinkPlain(node),
    ),
  );

/** The name the compiler parsed for each link a reader of `documentation` sees, where the link names a declaration and the compiler parsed one. */
export const namesOf = (
  documentation: AST.Documentation.Documentation,
): readonly (readonly [tag: DocLinkTag, name: Syntax.EntityName])[] => {
  const compiled = compilerLinks(documentation.node);

  return Array.flatMap(linksOf(documentation), (tag) => {
    const destination = tag.codeDestination;

    // A package-qualified destination names a public path, so it binds nothing in the comment's file.
    if (destination === undefined || destination.packageName !== undefined) {
      return [];
    }

    return pipe(
      startOf(tag),
      Option.flatMap((start) =>
        Array.findFirst(compiled, (link) => link.pos === start),
      ),
      Option.flatMap((link) => Option.fromUndefinedOr(link.name)),
      Option.map((name) => [tag, name] as const),
      Option.toArray,
    );
  });
};
