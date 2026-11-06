import { DocExcerpt } from "@microsoft/tsdoc";
import { Array, Option, pipe } from "effect";

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
