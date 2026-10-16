import { ApiDocumentedItem, ApiItemKind } from "@microsoft/api-extractor-model";
import { StandardTags } from "@microsoft/tsdoc";
import {
  Array,
  Effect,
  Filter,
  Option,
  Order,
  String,
  Struct,
  Tuple,
  pipe,
} from "effect";

import * as CodeBlock from "./CodeBlock.js";
import * as Comment from "./Comment.js";

import type { TransformError } from "./TransformError.js";
import type { ApiItem } from "@microsoft/api-extractor-model";
import type {
  DocBlock,
  DocComment,
  DocParamCollection,
  DocSection,
} from "@microsoft/tsdoc";
import type { BlockContent, Heading, ListItem, PhrasingContent } from "mdast";

/** The statements declaring a member, as its code block shows them. */
export interface Signature {
  /** The statements, as TypeScript. */
  readonly code: string;
  /** The rest of their declaration file, which the code block compiles them in and hides. */
  readonly context: string;
  /** For each name the code refers to, in order, the URL that documents it. */
  readonly urls: readonly Option.Option<string>[];
}

/** The declarations sharing one name in a container, with their source. */
export interface Member {
  /** Overloads in declaration order, or a merged interface and namespace. */
  readonly items: Array.NonEmptyReadonlyArray<ApiItem>;
  readonly signature: Signature;
  /** The anchor that links to an item on its page. */
  readonly anchor: (item: ApiItem) => string;
}

const memberDepth: Heading["depth"] = 3;
const nestedDepth: Heading["depth"] = 4;

const strong = (value: string): PhrasingContent => ({
  type: "strong",
  children: [{ type: "text", value }],
});

const heading = (depth: Heading["depth"], anchor: string): BlockContent => ({
  type: "heading",
  depth,
  children: [{ type: "text", value: `${anchor} [#${anchor}]` }],
});

// Twoslash compiles the whole block for its hovers, and shows only what follows the cut.
const code = ({
  code: shown,
  context,
  urls,
}: Signature): Effect.Effect<BlockContent> =>
  pipe(
    CodeBlock.meta(urls),
    // Encoding values of the schema's own type cannot fail.
    Effect.orDie,
    Effect.map(
      (meta): BlockContent => ({
        type: "code",
        lang: "ts",
        meta,
        value: `${context}\n${CodeBlock.cut}\n${shown}`,
      }),
    ),
  );

// A label opens the first paragraph of the content it introduces, or stands alone before a code block.
const labelled = (
  label: PhrasingContent,
  content: readonly BlockContent[],
): BlockContent[] => {
  const [first, ...rest] = content;

  if (first?.type === "paragraph") {
    return [
      {
        type: "paragraph",
        children: [label, { type: "text", value: " " }, ...first.children],
      },
      ...rest,
    ];
  }

  return [{ type: "paragraph", children: [label] }, ...content];
};

const comments = (items: readonly ApiItem[]): DocComment[] =>
  pipe(
    items,
    Array.filterMap(Filter.instanceOf(ApiDocumentedItem)),
    Array.filterMap(
      Filter.fromPredicateOption(({ tsdocComment }) =>
        Option.fromNullishOr(tsdocComment),
      ),
    ),
  );

const kindLabels: readonly (readonly [ApiItemKind, string])[] = [
  [ApiItemKind.Function, "Functions"],
  [ApiItemKind.Variable, "Variables"],
  [ApiItemKind.Class, "Classes"],
  [ApiItemKind.Interface, "Interfaces"],
  [ApiItemKind.TypeAlias, "Type aliases"],
  [ApiItemKind.Enum, "Enumerations"],
  [ApiItemKind.Namespace, "Namespaces"],
];

/** The heading that lists a member, which is its authored `@category` or else its kind. */
export const group = (items: Array.NonEmptyReadonlyArray<ApiItem>): string =>
  pipe(
    comments(items),
    Array.findFirst((comment) =>
      Array.head(Comment.blocksTagged(comment, "@category")),
    ),
    Option.map((block) => Comment.words(block.content)),
    Option.orElse(() =>
      pipe(
        kindLabels,
        Array.findFirst(([kind]) => kind === Array.headNonEmpty(items).kind),
        Option.map(Tuple.get(1)),
      ),
    ),
    Option.getOrElse(() => "Other"),
  );

// An authored category ranks before every kind, so categories sort among themselves by name.
const kindRank = (label: string): number =>
  pipe(
    kindLabels,
    Array.findFirstIndex(([, kind]) => kind === label),
    Option.getOrElse(() => -1),
  );

const groupOrder: Order.Order<string> = Order.combine(
  Order.mapInput(Order.Number, kindRank),
  String.Order,
);

/** Orders groups by their heading: authored categories alphabetically, then kinds in a fixed order. */
export const sortGroups = <A>(
  groups: Iterable<readonly [string, A]>,
): (readonly [string, A])[] => Array.sortWith(groups, Tuple.get(0), groupOrder);

// Stability, version and internal status, each only where the comment states it.
const markers = (comment: DocComment): BlockContent[] => {
  const tagged = (
    tagName: string,
    label: string,
  ): Option.Option<PhrasingContent[]> =>
    pipe(
      Comment.blocksTagged(comment, tagName),
      Array.head,
      Option.map((block) => [
        strong(label),
        { type: "text", value: ` ${Comment.words(block.content)}` },
      ]),
    );

  return pipe(
    Array.getSomes([
      tagged("@stability", "Stability"),
      tagged("@since", "Since"),
      Option.liftPredicate([strong("Internal")], () =>
        comment.modifierTagSet.isInternal(),
      ),
    ]),
    Array.match({
      onEmpty: () => [],
      onNonEmpty: (facts) => [
        {
          type: "paragraph",
          children: pipe(
            facts,
            Array.intersperse<PhrasingContent[]>([
              { type: "text", value: " · " },
            ]),
            Array.flatten,
          ),
        },
      ],
    }),
  );
};

const parameters = (
  label: string,
  collection: DocParamCollection,
): Effect.Effect<BlockContent[], TransformError, Comment.Links> =>
  pipe(
    collection.blocks,
    Effect.forEach((block) =>
      pipe(
        block.content,
        Comment.section,
        Effect.map(
          (content): ListItem => ({
            type: "listItem",
            spread: false,
            children: labelled(
              { type: "inlineCode", value: block.parameterName },
              content,
            ),
          }),
        ),
      ),
    ),
    Effect.map(
      Array.match({
        onEmpty: (): BlockContent[] => [],
        onNonEmpty: (items): BlockContent[] => [
          { type: "paragraph", children: [strong(label)] },
          { type: "list", ordered: false, spread: false, children: [...items] },
        ],
      }),
    ),
  );

const labelledSections = (
  label: string,
  sections: readonly DocSection[],
): Effect.Effect<BlockContent[], TransformError, Comment.Links> =>
  pipe(
    sections,
    Effect.forEach((content) =>
      pipe(
        content,
        Comment.section,
        Effect.map((blocks) => labelled(strong(label), blocks)),
      ),
    ),
    Effect.map(Array.flatten),
  );

const exampleBlocks = ({
  caption,
  content,
}: Comment.Example): BlockContent[] => {
  const label = Array.match(caption, {
    onEmpty: (): PhrasingContent[] => [strong("Example")],
    onNonEmpty: (phrasing): PhrasingContent[] => [
      strong("Example"),
      { type: "text", value: " (" },
      ...phrasing,
      { type: "text", value: ")" },
    ],
  });

  return [{ type: "paragraph", children: label }, ...content];
};

const contentOf = (block: DocBlock | undefined): DocSection[] =>
  Array.fromNullishOr(block?.content);

const documentation = (
  comment: DocComment,
): Effect.Effect<BlockContent[], TransformError, Comment.Links> =>
  pipe(
    [
      labelledSections("Deprecated", contentOf(comment.deprecatedBlock)),
      Effect.succeed(markers(comment)),
      Comment.overview(comment),
      parameters("Type parameters", comment.typeParams),
      parameters("Parameters", comment.params),
      labelledSections("Returns", contentOf(comment.returnsBlock)),
      labelledSections(
        "Throws",
        Array.map(
          Comment.blocksTagged(comment, StandardTags.throws.tagName),
          Struct.get("content"),
        ),
      ),
      labelledSections(
        "See",
        Array.map(comment.seeBlocks, Struct.get("content")),
      ),
      pipe(
        Comment.blocksTagged(comment, StandardTags.example.tagName),
        Effect.forEach(Comment.example),
        Effect.map(Array.flatMap(exampleBlocks)),
      ),
    ],
    Effect.all,
    Effect.map(Array.flatten),
  );

const descendants = (items: readonly ApiItem[]): ApiItem[] =>
  Array.flatMap(items, (item) => [item, ...descendants(item.members)]);

/** Renders a member as its heading and declarations, followed by the documentation of each declaration and of every documented nested member. */
export const render = ({
  items,
  signature,
  anchor,
}: Member): Effect.Effect<BlockContent[], TransformError, Comment.Links> =>
  pipe(
    [
      pipe(
        signature,
        code,
        Effect.map((block) => [
          heading(memberDepth, anchor(Array.headNonEmpty(items))),
          block,
        ]),
      ),
      pipe(
        comments(items),
        Effect.forEach(documentation),
        Effect.map(Array.flatten),
      ),
      pipe(
        items,
        Array.flatMap(Struct.get("members")),
        descendants,
        Array.flatMap((nested) =>
          Array.map(comments([nested]), (comment) => ({ nested, comment })),
        ),
        Effect.forEach(({ nested, comment }) =>
          pipe(
            comment,
            documentation,
            Effect.map(Array.prepend(heading(nestedDepth, anchor(nested)))),
          ),
        ),
        Effect.map(Array.flatten),
      ),
    ],
    Effect.all,
    Effect.map(Array.flatten),
  );
