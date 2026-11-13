import { Array, Function, Option, Result, pipe } from "effect";

import * as Tree from "../Tree/index.js";
import * as Output from "./output.js";
import * as Titles from "./titles.js";

import type * as Code from "../Code.js";
import type {
  Code as CodeBlock,
  ListItem,
  Paragraph,
  PhrasingContent,
  RootContent,
} from "mdast";

type Written<A> = Result.Result<A, Output.Failure>;

export const text = (value: string): PhrasingContent => ({
  type: "text",
  value,
});

export const inlineCode = (value: string): PhrasingContent => ({
  type: "inlineCode",
  value,
});

const labelOf = (
  node: Tree.Prose.Text | Tree.Prose.InlineCode,
): PhrasingContent => {
  if (node.type === "text") {
    return text(node.value);
  }

  return inlineCode(node.value);
};

/** Phrasing as Markdown. A link whose reference has no destination, such as a private declaration's, reads as its label. */
export const phrasing =
  (output: Output.Output) =>
  (node: Tree.Prose.Phrasing): Written<PhrasingContent[]> => {
    if (node.type !== "link") {
      return Result.succeed([labelOf(node)]);
    }

    const children = Array.map(node.children, labelOf);

    return Result.succeed(
      Option.match(Output.destination(output)(node.destination), {
        onNone: () => children,
        onSome: (url): PhrasingContent[] => [{ type: "link", url, children }],
      }),
    );
  };

const block =
  (output: Output.Output) =>
  (node: Tree.Prose.Block): Written<RootContent> => {
    if (node.type === "code") {
      return Result.succeed({
        type: "code",
        lang: Option.getOrNull(node.language),
        value: node.value,
      });
    }

    return pipe(
      node.children,
      Array.map(phrasing(output)),
      Result.all,
      Result.map((children): RootContent => ({
        type: "paragraph",
        children: Array.flatten(children),
      })),
    );
  };

export const blocks =
  (output: Output.Output) =>
  (nodes: readonly Tree.Prose.Block[]): Written<RootContent[]> =>
    Result.all(Array.map(nodes, block(output)));

/** A bold label on a line of its own, which Markdown writes in place of a section's heading. */
const bold = (value: string): Paragraph => ({
  type: "paragraph",
  children: [{ type: "strong", children: [text(value)] }],
});

/** `children` under `title`, or nothing when there are no children to label. */
export const section: {
  (title: string): (children: readonly RootContent[]) => RootContent[];
  (children: readonly RootContent[], title: string): RootContent[];
} = Function.dual(
  2,
  (children: readonly RootContent[], title: string): RootContent[] => {
    if (children.length === 0) {
      return [];
    }

    return Array.prepend(children, bold(title));
  },
);

/** The overloads something holds in, as Markdown writes them: `(1, 3)`. */
export const note = (overloads: Array.NonEmptyReadonlyArray<number>): string =>
  `(${overloads.join(", ")})`;

/** Every overload, as Markdown writes it beside the numbers of what holds in some overloads only. */
export const everyNote = "(all)";

/** `children` after `prefix`, on the first paragraph's line or on a line of its own before code. */
export const after: {
  (
    prefix: Option.Option<string>,
  ): (children: readonly RootContent[]) => RootContent[];
  (
    children: readonly RootContent[],
    prefix: Option.Option<string>,
  ): RootContent[];
} = Function.dual(
  2,
  (
    children: readonly RootContent[],
    prefix: Option.Option<string>,
  ): RootContent[] => {
    if (Option.isNone(prefix) || !Array.isReadonlyArrayNonEmpty(children)) {
      return Array.copy(children);
    }

    const [first, ...rest] = children;
    if (first.type === "paragraph") {
      return Array.prepend(rest, {
        ...first,
        children: Array.prepend(first.children, text(`${prefix.value} `)),
      });
    }

    return Array.prepend(children, {
      type: "paragraph",
      children: [text(prefix.value)],
    });
  },
);

/** `children` after the overloads `applies` names. */
export const noted: {
  (
    applies: Tree.Callable.Applies,
  ): (children: readonly RootContent[]) => RootContent[];
  (
    children: readonly RootContent[],
    applies: Tree.Callable.Applies,
  ): RootContent[];
} = Function.dual(
  2,
  (
    children: readonly RootContent[],
    applies: Tree.Callable.Applies,
  ): RootContent[] =>
    after(children, Option.map(Output.overloads(applies), note)),
);

/** A declaration's facts on one line: `Since 0.2 · beta · Internal · Source`. */
export const facts = (value: Output.Facts): Option.Option<Paragraph> => {
  const pieces: PhrasingContent[][] = [
    ...Array.map(Option.toArray(value.since), (since) => [
      text(`Since ${since}`),
    ]),
    ...Array.map(Option.toArray(value.stability), (stability) => [
      text(stability),
    ]),
    ...Array.map(Array.filter([value.internal], Function.identity), () => [
      text("Internal"),
    ]),
    ...Array.map(Option.toArray(value.source), (url): PhrasingContent[] => [
      { type: "link", url, children: [text("Source")] },
    ]),
  ];

  return pipe(
    pieces,
    Option.liftPredicate(Array.isReadonlyArrayNonEmpty<PhrasingContent[]>),
    Option.map((nonEmpty): Paragraph => ({
      type: "paragraph",
      children: Array.flatten(Array.intersperse(nonEmpty, [text(" · ")])),
    })),
  );
};

export const code = (source: Code.Source): CodeBlock => ({
  type: "code",
  lang: "ts",
  value: source.text,
});

/** One of several declarations names its overloads and its own facts on the line before its code. */
const numbered =
  (output: Output.Output) =>
  (value: Tree.Declaration.Signature): RootContent => ({
    type: "paragraph",
    children: [
      text(note(Array.map(value.overloads, ({ index }) => index))),
      ...pipe(
        facts(Output.signatureFacts(output)(value)),
        Option.toArray,
        Array.flatMap(({ children }) => [text(" · "), ...children]),
      ),
    ],
  });

/** Each declaration's code after its facts, which name its overloads when there are several. */
export const declarations =
  (output: Output.Output) =>
  (children: readonly Tree.Declaration.Signature[]): Written<RootContent[]> =>
    pipe(
      children,
      Array.map((value) =>
        output.printed.signature(value.syntax).pipe(
          Result.map((printed): RootContent[] => {
            if (children.length === 1) {
              return [
                ...Option.toArray(facts(Output.signatureFacts(output)(value))),
                code(printed),
              ];
            }

            return [numbered(output)(value), code(printed)];
          }),
        ),
      ),
      Result.all,
      Result.map(Array.flatten),
    );

/** What an `@deprecated` says, after a bold `Deprecated:` on its first paragraph's line. */
const deprecated = (content: readonly RootContent[]): RootContent[] => {
  const marker: PhrasingContent = {
    type: "strong",
    children: [text(Titles.sections.deprecated)],
  };
  const [first, ...rest] = content;
  if (first?.type === "paragraph") {
    return Array.prepend(rest, {
      ...first,
      children: [marker, text(" "), ...first.children],
    });
  }

  return Array.prepend(content, { type: "paragraph", children: [marker] });
};

/** The blocks of an optional section, or none. */
const optional =
  (output: Output.Output) =>
  (
    value: Option.Option<{ readonly children: readonly Tree.Prose.Block[] }>,
  ): Written<RootContent[]> =>
    pipe(
      value,
      Option.map(({ children }) => blocks(output)(children)),
      Result.transposeOption,
      Result.map(Option.getOrElse((): RootContent[] => [])),
    );

/** A comment's description, after what its `@deprecated` says. */
export const description =
  (output: Output.Output) =>
  (comment: Tree.Comment.Comment): Written<RootContent[]> =>
    Result.gen(function* () {
      const deprecation = yield* pipe(
        comment.facts.deprecation,
        Option.map(({ children }) =>
          blocks(output)(children).pipe(Result.map(deprecated)),
        ),
        Result.transposeOption,
        Result.map(Option.getOrElse((): RootContent[] => [])),
      );
      const own = yield* optional(output)(comment.description);

      return noted(Array.appendAll(deprecation, own), comment.applies);
    });

/** A comment's remarks and custom blocks. */
export const details =
  (output: Output.Output) =>
  (comment: Tree.Comment.Comment): Written<RootContent[]> =>
    Result.gen(function* () {
      const remarks = yield* optional(output)(comment.remarks);
      const custom = yield* pipe(
        comment.custom,
        Array.map(({ tag, children }) =>
          blocks(output)(children).pipe(Result.map(section(tag))),
        ),
        Result.all,
        Result.map(Array.flatten),
      );

      return noted(
        Array.appendAll(section(remarks, Titles.sections.remarks), custom),
        comment.applies,
      );
    });

const example =
  (output: Output.Output) =>
  (value: Tree.Comment.Example): Written<RootContent[]> =>
    Result.gen(function* () {
      const caption = yield* pipe(
        value.caption,
        Option.map(({ children }) =>
          Result.all(Array.map(children, phrasing(output))).pipe(
            Result.map(Array.flatten),
          ),
        ),
        Result.transposeOption,
      );
      const source = yield* Option.match(value.program, {
        onNone: () =>
          Result.succeed<Code.Source>({ text: value.code, names: [] }),
        onSome: output.printed.example,
      });

      return [
        bold(Titles.sections.example),
        ...Array.map(Option.toArray(caption), (children): RootContent => ({
          type: "paragraph",
          children,
        })),
        { ...code(source), lang: Option.getOrNull(value.language) },
      ];
    });

export const examples =
  (output: Output.Output) =>
  (comment: Tree.Comment.Comment): Written<RootContent[]> =>
    pipe(
      comment.examples,
      Array.map(example(output)),
      Result.all,
      Result.map((written) => noted(Array.flatten(written), comment.applies)),
    );

export const references =
  (output: Output.Output) =>
  (comment: Tree.Comment.Comment): Written<RootContent[]> =>
    pipe(
      comment.see,
      Array.map(({ children }) => blocks(output)(children)),
      Result.all,
      Result.map((content) =>
        noted(
          section(Array.flatten(content), Titles.sections.see),
          comment.applies,
        ),
      ),
    );

/** Every part of a comment that documents its declaration as a whole. */
export const whole =
  (output: Output.Output) =>
  (comment: Tree.Comment.Comment): Written<RootContent[]> =>
    Result.all([
      description(output)(comment),
      details(output)(comment),
      examples(output)(comment),
      references(output)(comment),
    ]).pipe(Result.map(Array.flatten));

/** The first sentence of a row's summary, as plain text, or nothing for an undocumented row. */
const summaryOf = (row: Tree.Row.Row): Option.Option<string> =>
  pipe(
    row.summary,
    Option.flatMap(Tree.Prose.plain),
    Option.map(Tree.Prose.sentence),
  );

const rowItem =
  (output: Output.Output) =>
  (row: Tree.Row.Row): Written<ListItem> => {
    const label = inlineCode(row.label.join("."));

    return Result.succeed({
      type: "listItem",
      spread: false,
      children: [
        {
          type: "paragraph",
          children: [
            Option.match(Output.row(output)(row), {
              onNone: () => label,
              onSome: (url): PhrasingContent => ({
                type: "link",
                url,
                children: [label],
              }),
            }),
            ...Array.map(
              Array.appendAll(
                row.deprecated ? [Titles.deprecatedRow] : [],
                Option.toArray(summaryOf(row)),
              ),
              (said) => text(` ${said}`),
            ),
          ],
        },
      ],
    });
  };

/** List items with each run of deeper items nested under the item before it. */
const nest = (items: readonly (readonly [number, ListItem])[]): ListItem[] => {
  const children: ListItem[] = [];
  let rest = items;
  while (Array.isReadonlyArrayNonEmpty(rest)) {
    const [[depth, item], ...after] = rest;
    const deeper = Array.takeWhile(after, ([level]) => level > depth);
    rest = Array.drop(after, deeper.length);
    if (deeper.length === 0) {
      children.push(item);
    } else {
      children.push({
        ...item,
        children: [
          ...item.children,
          {
            type: "list",
            ordered: false,
            spread: false,
            children: nest(deeper),
          },
        ],
      });
    }
  }

  return children;
};

/** Rows as a list, nested by their depth. */
export const rows =
  (output: Output.Output) =>
  (values: readonly Tree.Row.Row[]): Written<RootContent[]> =>
    pipe(
      values,
      Array.map((row) =>
        rowItem(output)(row).pipe(
          Result.map((item) => [row.depth, item] as const),
        ),
      ),
      Result.all,
      Result.map((items): RootContent[] => {
        if (items.length === 0) {
          return [];
        }

        return [
          {
            type: "list",
            ordered: false,
            spread: false,
            children: nest(items),
          },
        ];
      }),
    );
