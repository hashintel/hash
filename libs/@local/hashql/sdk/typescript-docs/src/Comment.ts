import {
  DocCodeSpan,
  DocErrorText,
  DocEscapedText,
  DocFencedCode,
  DocHtmlEndTag,
  DocHtmlStartTag,
  DocInlineTag,
  DocLinkTag,
  DocNodeTransforms,
  DocParagraph,
  DocPlainText,
  DocSoftBreak,
  StandardTags,
} from "@microsoft/tsdoc";
import {
  Array,
  Context,
  Effect,
  Filter,
  Function,
  Match,
  Option,
  String,
  Tuple,
  flow,
  pipe,
} from "effect";

import { TransformError } from "./TransformError.js";

import type {
  DocBlock,
  DocComment,
  DocDeclarationReference,
  DocNode,
  DocSection,
} from "@microsoft/tsdoc";
import type { BlockContent, PhrasingContent } from "mdast";

/** Resolves declaration references in the comment under conversion, as its own module sees them. */
export class Links extends Context.Service<
  Links,
  {
    /** The URL of what a reference names, `None` when it names nothing on a page. */
    readonly resolve: (
      reference: DocDeclarationReference,
    ) => Effect.Effect<Option.Option<string>>;
  }
>()("@local/hashql-typescript-docs/Comment/Links") {}

/** An `@example` block split at its `<caption>`. The caption is empty when the block opens without one. */
export interface Example {
  readonly caption: readonly PhrasingContent[];
  readonly content: readonly BlockContent[];
}

const linkTagNames: ReadonlySet<string> = new Set([
  StandardTags.link.tagName,
  "@linkcode",
  "@linkplain",
]);

// TSDoc parses a link whose reference it cannot read as a generic inline tag.
const isUnparsedLink = (node: DocNode): node is DocInlineTag =>
  node instanceof DocInlineTag && linkTagNames.has(node.tagName);

const isParagraph = (node: DocNode | undefined): node is DocParagraph =>
  node instanceof DocParagraph;

const text = (value: string): PhrasingContent => ({ type: "text", value });

const inlineCode = (value: string): PhrasingContent => ({
  type: "inlineCode",
  value,
});

const linkLabel = (tag: DocLinkTag): PhrasingContent => {
  if (tag.linkText !== undefined) {
    return text(tag.linkText);
  }

  return inlineCode(
    tag.codeDestination?.emitAsTsdoc() ?? tag.urlDestination ?? "",
  );
};

const destination = Effect.fnUntraced(function* (tag: DocLinkTag) {
  const links = yield* Links;

  if (tag.urlDestination !== undefined) {
    return Option.some(tag.urlDestination);
  }

  if (tag.codeDestination !== undefined) {
    return yield* links.resolve(tag.codeDestination);
  }

  return Option.none<string>();
});

const link = (tag: DocLinkTag): Effect.Effect<PhrasingContent, never, Links> =>
  pipe(
    tag,
    destination,
    Effect.map(
      Option.match({
        onNone: () => linkLabel(tag),
        onSome: (url): PhrasingContent => ({
          type: "link",
          url,
          children: [linkLabel(tag)],
        }),
      }),
    ),
  );

// TSDoc keeps the characters it could not parse as error text, and the analysis reports each at its source line.
const phrasing: (
  node: DocNode,
) => Effect.Effect<PhrasingContent, TransformError, Links> =
  Match.type<DocNode>().pipe(
    Match.when(Match.instanceOf(DocPlainText), ({ text: value }) =>
      Effect.succeed(text(value)),
    ),
    Match.when(Match.instanceOf(DocSoftBreak), () => Effect.succeed(text(" "))),
    Match.when(Match.instanceOf(DocCodeSpan), ({ code }) =>
      Effect.succeed(inlineCode(code)),
    ),
    Match.when(Match.instanceOf(DocEscapedText), ({ decodedText }) =>
      Effect.succeed(text(decodedText)),
    ),
    Match.when(Match.instanceOf(DocErrorText), ({ text: value }) =>
      Effect.succeed(text(value)),
    ),
    Match.when(Match.instanceOf(DocLinkTag), link),
    Match.when(isUnparsedLink, ({ tagContent }) =>
      Effect.succeed(inlineCode(tagContent.trim())),
    ),
    Match.orElse(({ kind }) =>
      Effect.fail(TransformError.unsupportedComment(kind)),
    ),
  );

/** Converts a TSDoc paragraph to mdast phrasing content, with its spacing collapsed. */
export const paragraph = (
  node: DocParagraph,
): Effect.Effect<PhrasingContent[], TransformError, Links> =>
  pipe(
    DocNodeTransforms.trimSpacesInParagraph(node).getChildNodes(),
    Effect.forEach(phrasing),
  );

const block: (
  node: DocNode,
) => Effect.Effect<BlockContent[], TransformError, Links> =
  Match.type<DocNode>().pipe(
    Match.when(Match.instanceOf(DocParagraph), (child) =>
      paragraph(child).pipe(
        Effect.map((children): BlockContent[] => {
          if (Array.isReadonlyArrayNonEmpty(children)) {
            return [{ type: "paragraph", children }];
          }

          return [];
        }),
      ),
    ),
    Match.when(Match.instanceOf(DocFencedCode), ({ language, code }) =>
      Effect.succeed<BlockContent[]>([
        {
          type: "code",
          lang: Option.getOrNull(
            Option.liftPredicate(language, String.isNonEmpty),
          ),
          value: code.trimEnd(),
        },
      ]),
    ),
    Match.orElse(({ kind }) =>
      Effect.fail(TransformError.unsupportedComment(kind)),
    ),
  );

/** Converts block-level TSDoc nodes to mdast blocks. */
export const blocks: (
  nodes: Iterable<DocNode>,
) => Effect.Effect<BlockContent[], TransformError, Links> = flow(
  Effect.forEach(block),
  Effect.map(Array.flatten),
);

/** Converts a TSDoc section to mdast blocks. */
export const section = (
  node: DocSection,
): Effect.Effect<BlockContent[], TransformError, Links> =>
  blocks(node.getChildNodes());

/** A comment's summary and remarks, the prose that introduces what it documents. */
export const overview = (
  comment: DocComment,
): Effect.Effect<BlockContent[], TransformError, Links> =>
  pipe(
    [
      section(comment.summarySection),
      blocks(Array.fromNullishOr(comment.remarksBlock?.content)),
    ],
    Effect.all,
    Effect.map(Array.flatten),
  );

/** The first paragraph of a comment's summary, which stands for it in a list. */
export const lead = (
  comment: DocComment,
): Effect.Effect<PhrasingContent[], TransformError, Links> =>
  pipe(
    comment.summarySection.getChildNodes(),
    Array.head,
    Option.filter(isParagraph),
    Option.match({
      onNone: () => Effect.succeed([]),
      onSome: paragraph,
    }),
  );

/** The custom blocks of a comment that carry one tag, in source order. */
export const blocksTagged: {
  (tagName: string): (comment: DocComment) => readonly DocBlock[];
  (comment: DocComment, tagName: string): readonly DocBlock[];
} = Function.dual(
  2,
  (comment: DocComment, tagName: string): readonly DocBlock[] =>
    pipe(
      comment.customBlocks,
      Array.filter(
        ({ blockTag }) =>
          blockTag.tagNameWithUpperCase === String.toUpperCase(tagName),
      ),
    ),
);

/** The words of a section, for tags whose value is a name or a version rather than prose. */
export const words = (node: DocSection): string =>
  pipe(
    node.getChildNodes(),
    Array.filterMap(Filter.instanceOf(DocParagraph)),
    Array.flatMap((node) =>
      DocNodeTransforms.trimSpacesInParagraph(node).getChildNodes(),
    ),
    Array.map(
      Match.type<DocNode>().pipe(
        Match.when(Match.instanceOf(DocPlainText), ({ text: value }) => value),
        Match.when(Match.instanceOf(DocCodeSpan), ({ code }) => code),
        Match.orElse(() => " "),
      ),
    ),
    Array.join(""),
    String.trim,
  );

// The space after a block tag and the line breaks before its content parse as text of their own.
const isBlank = (node: DocNode): boolean =>
  node instanceof DocSoftBreak ||
  (node instanceof DocPlainText && String.isEmpty(String.trim(node.text)));

const paragraphOf = (
  configuration: DocParagraph["configuration"],
  nodes: readonly DocNode[],
): DocParagraph => {
  const result = new DocParagraph({ configuration });
  result.appendNodes(nodes);

  return result;
};

const isCaption =
  (tag: typeof DocHtmlStartTag | typeof DocHtmlEndTag) =>
  (node: DocNode): boolean =>
    node instanceof tag && node.name === "caption";

// JSDoc's `<caption>` opens the first paragraph of an example. Everything after the caption is ordinary content.
export const example = (
  node: DocBlock,
): Effect.Effect<Example, TransformError, Links> =>
  Option.gen(function* () {
    const [first, ...rest] = node.content.getChildNodes();

    const opening = yield* Option.liftPredicate(first, isParagraph);
    const nodes = opening.getChildNodes();

    const start = yield* pipe(
      nodes,
      Array.findFirstWithIndex((node) => !isBlank(node)),
      Option.filter(([node]) => isCaption(DocHtmlStartTag)(node)),
      Option.map(Tuple.get(1)),
    );
    const end = yield* Array.findFirstIndex(nodes, isCaption(DocHtmlEndTag));

    return {
      title: paragraphOf(opening.configuration, nodes.slice(start + 1, end)),
      remainder: paragraphOf(opening.configuration, nodes.slice(end + 1)),
    };
  }).pipe(
    Option.match({
      onNone: () =>
        pipe(
          node.content,
          section,
          Effect.map((content): Example => ({ caption: [], content })),
        ),
      onSome: ({ title, remainder }) =>
        Effect.all({
          caption: paragraph(title),
          content: blocks(
            Array.setHeadNonEmpty(
              node.content.getChildNodes() as Array.NonEmptyArray<DocNode>,
              remainder,
            ),
          ),
        }),
    }),
  );
