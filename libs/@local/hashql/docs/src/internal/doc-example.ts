import {
  DocFencedCode,
  DocHtmlEndTag,
  DocHtmlStartTag,
  DocParagraph,
  DocPlainText,
  DocSoftBreak,
} from "@microsoft/tsdoc";
import { Array, Option, Result, pipe } from "effect";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";

import type { DocBlock, DocNode } from "@microsoft/tsdoc";

const isBlank = (node: DocNode): boolean =>
  node instanceof DocSoftBreak ||
  (node instanceof DocPlainText && node.text.trim() === "");

/** Accepts a paragraph only when, apart from surrounding whitespace, it is exactly one `<caption>` element. */
const captionOf = (
  paragraph: DocParagraph,
): Option.Option<AST.Documentation.Caption.Caption> => {
  const nodes = pipe(
    paragraph.nodes,
    Array.dropWhile(isBlank),
    Array.reverse,
    Array.dropWhile(isBlank),
    Array.reverse,
  );

  if (!Array.isReadonlyArrayNonEmpty(nodes)) {
    return Option.none();
  }

  const [opening, rest] = Array.unprepend(nodes);
  if (
    !(opening instanceof DocHtmlStartTag && opening.name === "caption") ||
    !Array.isReadonlyArrayNonEmpty(rest)
  ) {
    return Option.none();
  }

  const [content, closing] = Array.unappend(rest);
  if (!(closing instanceof DocHtmlEndTag && closing.name === "caption")) {
    return Option.none();
  }

  return Option.some(
    AST.Documentation.Caption.make({ node: paragraph, content }),
  );
};

/**
 * Accepts one fenced code block, optionally preceded by a caption paragraph.
 *
 * Blank paragraphs are ignored. Any other prose fails instead of being dropped, so an example never loses text its author meant a reader to see.
 */
export const parse =
  (file: string) =>
  (
    block: DocBlock,
  ): Result.Result<
    AST.Documentation.Example.Example,
    DocumentationError.DocumentationError
  > => {
    const invalid = Result.fail(
      DocumentationError.DocumentationError.make({
        file,
        reason: {
          _tag: "InvalidExample",
          start: block.blockTag.getTokenSequence().getContainingTextRange().pos,
        },
      }),
    );

    const nodes = Array.filter(
      block.content.nodes,
      (node) =>
        !(node instanceof DocParagraph && Array.every(node.nodes, isBlank)),
    );

    if (!Array.isReadonlyArrayNonEmpty(nodes)) {
      return invalid;
    }

    const [before, fence] = Array.unappend(nodes);
    if (!(fence instanceof DocFencedCode) || before.length > 1) {
      return invalid;
    }

    const caption = pipe(
      before,
      Array.head,
      Option.filter((node) => node instanceof DocParagraph),
      Option.flatMap(captionOf),
    );

    if (before.length > 0 && Option.isNone(caption)) {
      return invalid;
    }

    return Result.succeed(
      AST.Documentation.Example.make({ node: block, caption, fence }),
    );
  };
