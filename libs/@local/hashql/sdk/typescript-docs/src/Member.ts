import { ApiDocumentedItem, ApiItemKind } from "@microsoft/api-extractor-model";
import { StandardTags } from "@microsoft/tsdoc";
import { Array, Effect, Filter, Option, String, identity, pipe } from "effect";

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

/** The declarations sharing one name in a container, with their source. */
export interface Member {
  /** Overloads in declaration order, or a merged interface and namespace. */
  readonly items: Array.NonEmptyReadonlyArray<ApiItem>;
  /** The statements declaring the member, as TypeScript. */
  readonly signature: string;
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

const commentOf = (item: ApiItem): Option.Option<DocComment> => {
  if (item instanceof ApiDocumentedItem) {
    return Option.fromNullishOr(item.tsdocComment);
  }

  return Option.none();
};

const comments = (items: readonly ApiItem[]): DocComment[] =>
  Array.filterMap(items, Filter.fromPredicateOption(commentOf));

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
      Array.findFirst(
        kindLabels,
        ([kind]) => kind === Array.headNonEmpty(items).kind,
      ).pipe(Option.map(([, label]) => label)),
    ),
    Option.getOrElse(() => "Other"),
  );

/** Orders group headings: authored categories alphabetically, then kinds in a fixed order. */
export const groupOrder = (labels: Iterable<string>): string[] => {
  const present = Array.dedupe(labels);
  const kinds = pipe(
    kindLabels,
    Array.map(([, label]) => label),
  );

  return [
    ...pipe(
      present,
      Array.filter((label) => !kinds.includes(label)),
      Array.sortWith(identity, String.Order),
    ),
    ...pipe(
      kinds,
      Array.filter((label) => present.includes(label)),
    ),
  ];
};

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
      Comment.section(block.content).pipe(
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
      Comment.section(content).pipe(
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
  Effect.all([
    labelledSections("Deprecated", contentOf(comment.deprecatedBlock)),
    Effect.succeed(markers(comment)),
    Comment.overview(comment),
    parameters("Type parameters", comment.typeParams),
    parameters("Parameters", comment.params),
    labelledSections("Returns", contentOf(comment.returnsBlock)),
    labelledSections(
      "Throws",
      pipe(
        Comment.blocksTagged(comment, StandardTags.throws.tagName),
        Array.map(({ content }) => content),
      ),
    ),
    labelledSections(
      "See",
      pipe(
        comment.seeBlocks,
        Array.map(({ content }) => content),
      ),
    ),
    pipe(
      Comment.blocksTagged(comment, StandardTags.example.tagName),
      Effect.forEach(Comment.example),
      Effect.map(Array.flatMap(exampleBlocks)),
    ),
  ]).pipe(Effect.map(Array.flatten));

const descendants = (items: readonly ApiItem[]): ApiItem[] =>
  pipe(
    items,
    Array.flatMap((item) => [item, ...descendants(item.members)]),
  );

/** Renders a member as its heading and declarations, followed by the documentation of each declaration and of every documented nested member. */
export const render = ({
  items,
  signature,
  anchor,
}: Member): Effect.Effect<BlockContent[], TransformError, Comment.Links> =>
  Effect.all([
    Effect.succeed<BlockContent[]>([
      heading(memberDepth, anchor(Array.headNonEmpty(items))),
      { type: "code", lang: "ts", value: signature },
    ]),
    pipe(
      comments(items),
      Effect.forEach(documentation),
      Effect.map(Array.flatten),
    ),
    pipe(
      items,
      Array.flatMap((item) => item.members),
      descendants,
      Array.flatMap((nested) =>
        pipe(
          comments([nested]),
          Array.map((comment) => ({ nested, comment })),
        ),
      ),
      Effect.forEach(({ nested, comment }) =>
        Effect.all([
          Effect.succeed([heading(nestedDepth, anchor(nested))]),
          documentation(comment),
        ]).pipe(Effect.map(Array.flatten)),
      ),
      Effect.map(Array.flatten),
    ),
  ]).pipe(Effect.map(Array.flatten));
