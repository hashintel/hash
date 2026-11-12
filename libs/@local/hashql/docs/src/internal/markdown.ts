import { Array, Match, Option, Result, Struct, pipe } from "effect";
import {
  defaultHandlers as markdownHandlers,
  toMarkdown as mdastToMarkdown,
} from "mdast-util-to-markdown";

import * as Import from "../Import.js";
import * as Callable from "./markdown-callable.js";
import * as Content from "./markdown-content.js";
import * as Output from "./output.js";
import * as Titles from "./titles.js";

import type * as Tree from "../Tree/index.js";
import type { Heading, Html, PhrasingContent, Root, RootContent } from "mdast";
import type { Handle } from "mdast-util-to-markdown";

declare module "mdast" {
  interface HeadingData {
    /** The kind of the entry a heading names, for the outline. */
    kind?: Tree.Row.Kind | undefined;
  }
}

type Written<A> = Result.Result<A, Output.Failure>;

const headingDepth = { page: 2, entry: 3, nested: 4 } as const;

const heading = ({
  title,
  id,
  depth,
  kind,
}: {
  readonly title: string;
  readonly id: string;
  readonly depth: Heading["depth"];
  readonly kind?: Tree.Row.Kind;
}): Heading => ({
  type: "heading",
  depth,
  children: [Content.text(title)],
  data: { kind, hProperties: { id } },
});

/** The HTML anchor that gives a heading or a member the id `id`, which Markdown has no syntax for. */
const anchorOf = (id: string): string => {
  const escaped = id
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");

  return `<a id="${escaped}"></a>`;
};

type Part = (
  output: Output.Output,
) => (comment: Tree.Comment.Comment) => Written<RootContent[]>;

/** One part of every comment on a declaration, in source order. */
const comments =
  (output: Output.Output) =>
  (
    values: readonly Tree.Comment.Comment[],
    part: Part,
  ): Written<RootContent[]> =>
    pipe(
      values,
      Array.map(part(output)),
      Result.all,
      Result.map(Array.flatten),
    );

const signatures =
  (output: Output.Output) =>
  (
    values: Option.Option<Tree.Declaration.Signatures>,
  ): Written<RootContent[]> =>
    Content.declarations(output)(
      Array.flatMap(Option.toArray(values), ({ children }) => children),
    ).pipe(
      Result.map(
        Content.section(
          Titles.signatures({
            total: Output.count(values),
            counted: Output.counted(values),
          }),
        ),
      ),
    );

/** Declarations of a member, then what documents them: the descriptions of their comments, their documented calls and the comments' other sections. */
const documented =
  (output: Output.Output) =>
  (
    declared: readonly Tree.Declaration.Signature[],
    values: readonly Tree.Comment.Comment[],
    calls: Tree.Callable.Callable,
  ): Written<RootContent[]> => {
    const each = comments(output);

    return Result.all([
      Content.declarations(output)(declared),
      each(values, Content.description),
      Callable.callable(output)(calls),
      each(values, Content.details),
      each(values, Content.examples),
      each(values, Content.references),
    ]).pipe(Result.map(Array.flatten));
  };

/** A member's declarations with their documentation. A getter and a setter each come with what their own comment documents. */
const body =
  (output: Output.Output) =>
  (value: Tree.Member.Member): Written<RootContent[]> => {
    if (value.type !== "accessor") {
      return documented(output)(
        value.signatures.children,
        value.comments,
        value,
      );
    }

    return pipe(
      value.halves,
      Array.map((half) =>
        documented(output)(
          [half.signature],
          Option.toArray(half.comment),
          half,
        ),
      ),
      Result.all,
      Result.map(Array.flatten),
    );
  };

const member =
  (output: Output.Output) =>
  (value: Tree.Member.Member): Written<RootContent[]> =>
    body(output)(value).pipe(
      Result.map((written): RootContent[] => {
        const anchor: Html = {
          type: "html",
          value: anchorOf(Output.memberId(output)(value)),
        };

        return [
          {
            type: "paragraph",
            children: [
              anchor,
              {
                type: "strong",
                children: [Content.inlineCode(value.name)],
              },
            ],
          },
          ...written,
        ];
      }),
    );

const related =
  (output: Output.Output) =>
  (
    value: Tree.Row.Related,
    groups: readonly (keyof Tree.Row.Related)[],
  ): Written<RootContent[]> =>
    pipe(
      groups,
      Array.map((group) =>
        Content.rows(output)(value[group]).pipe(
          Result.map(Content.section(Titles.related[group])),
        ),
      ),
      Result.all,
      Result.map(Array.flatten),
    );

const exported =
  (output: Output.Output) =>
  (value: Tree.Export.Export, depth: number): Written<RootContent[]> =>
    Result.gen(function* () {
      const each = comments(output);
      const place = Output.place(output)(value);
      const members = yield* pipe(
        value.members,
        Array.map(member(output)),
        Result.all,
        Result.map(Array.flatten),
      );
      const namespace = yield* pipe(
        value.namespace,
        Option.map((space) =>
          Result.gen(function* () {
            const own = yield* pipe(
              space.comment,
              Option.map(Content.whole(output)),
              Result.transposeOption,
              Result.map(Option.getOrElse((): RootContent[] => [])),
            );
            const index = yield* Content.rows(output)(space.index);
            const nested = yield* Result.all(
              Array.map(space.exports, (inner) =>
                exported(output)(inner, depth + 1),
              ),
            );

            return Content.section(
              [
                ...own,
                ...Content.section(index, Titles.sections.exports),
                ...Array.flatten(nested),
              ],
              `namespace ${place.title}`,
            );
          }),
        ),
        Result.transposeOption,
        Result.map(Option.getOrElse((): RootContent[] => [])),
      );

      return [
        heading({
          title: place.names.join("."),
          id: place.id,
          depth: depth === 0 ? headingDepth.entry : headingDepth.nested,
          kind: value.kind,
        }),
        ...(yield* each(value.comments, Content.description)),
        ...(yield* signatures(output)(value.signatures)),
        ...(yield* related(output)(value.related, ["traits"])),
        ...(yield* Callable.callable(output)(value)),
        ...(yield* each(value.comments, Content.details)),
        ...(yield* each(value.comments, Content.examples)),
        ...(yield* each(value.comments, Content.references)),
        ...(yield* related(output)(value.related, [
          "implementedBy",
          "acceptedBy",
          "returnedBy",
        ])),
        // A member is a paragraph, so only the next heading ends the members. They come last, after every section of the export itself.
        ...Content.section(members, Titles.sections.members),
        ...namespace,
      ];
    });

const modulePage =
  (output: Output.Output) =>
  (page: Tree.Page.Module): Written<RootContent[]> =>
    Result.gen(function* () {
      const facts = Content.facts(
        Output.facts(output)({
          facts: Option.map(page.comment, ({ facts: stated }) => stated),
          origin: Option.some(page.namespace),
        }),
      );
      const own = yield* pipe(
        page.comment,
        Option.map(Content.whole(output)),
        Result.transposeOption,
        Result.map(Option.getOrElse((): RootContent[] => [])),
      );
      const index = yield* pipe(
        page.groups,
        Array.map(({ grouping, rows }) =>
          Content.rows(output)(rows).pipe(
            Result.map(Content.section(Titles.grouping(grouping))),
          ),
        ),
        Result.all,
        Result.map(Array.flatten),
      );
      const groups = yield* pipe(
        page.groups,
        Array.flatMap((group) =>
          Array.map(Option.toArray(Output.groupId(output)(page, group)), (id) =>
            pipe(
              group.exports,
              Array.map((each) => exported(output)(each, 0)),
              Result.all,
              Result.map((written) => [
                heading({
                  title: Titles.grouping(group.grouping),
                  id,
                  depth: headingDepth.page,
                }),
                ...Array.flatten(written),
              ]),
            ),
          ),
        ),
        Result.all,
        Result.map(Array.flatten),
      );
      let contents: RootContent[] = [];
      if (index.length > 0) {
        contents = [
          heading({
            title: Titles.sections.index,
            id: Output.indexId(output)(page),
            depth: headingDepth.page,
          }),
          ...index,
        ];
      }

      return [
        ...Option.toArray(facts),
        ...own,
        { type: "code", lang: "ts", value: Import.print(page.import) },
        ...contents,
        ...groups,
      ];
    });

/** A trait's own comment, or the reference's explanation of it. */
const describe =
  (output: Output.Output) =>
  (value: Tree.Trait.Trait["description"]): Written<RootContent[]> => {
    if (value.type === "comment") {
      return Content.whole(output)(value);
    }

    return Content.blocks(output)(value.children);
  };

/** A page's first paragraph, for a page the reference makes itself. */
const lead = (value: string): RootContent => ({
  type: "paragraph",
  children: [Content.text(value)],
});

/** The paragraph after a trait's description, which names its declaration and the guide that explains it. */
const whereDeclared =
  (output: Output.Output) =>
  (value: Tree.Trait.Trait): RootContent[] => {
    const pieces = Titles.traitPieces({
      trait: value,
      declaration: Output.href(output)(value.origin),
      external: Option.isSome(Output.external(output)(value.origin)),
    });
    const children = Array.map(
      pieces,
      Titles.matchPiece({
        Text: ({ value: text }): PhrasingContent => Content.text(text),
        Declaration: ({ href }): PhrasingContent => ({
          type: "link",
          url: href,
          children: [Content.inlineCode(value.name)],
        }),
        Guide: ({ href, label }): PhrasingContent => ({
          type: "link",
          url: href,
          children: [Content.text(label)],
        }),
      }),
    );

    return children.length === 0 ? [] : [{ type: "paragraph", children }];
  };

const trait =
  (output: Output.Output) =>
  (value: Tree.Trait.Trait): Written<RootContent[]> =>
    Result.gen(function* () {
      const written = yield* describe(output)(value.description);
      const implementors = yield* Content.rows(output)(value.implementors);

      return [
        heading({
          title: value.name,
          id: Output.traitId(output)(value),
          depth: headingDepth.page,
          kind: "trait",
        }),
        ...written,
        ...whereDeclared(output)(value),
        ...Content.section(implementors, Titles.related.implementedBy),
      ];
    });

const overview =
  (output: Output.Output) =>
  (page: Tree.Page.Overview): Written<RootContent[]> =>
    Result.gen(function* () {
      const entrypoints = yield* Content.rows(output)(page.entrypoints);
      const traits = yield* Content.rows(output)(page.traits);
      let shared: RootContent[] = [];
      if (traits.length > 0) {
        shared = [
          heading({
            title: Titles.sections.traits,
            id: "traits",
            depth: headingDepth.page,
          }),
          ...traits,
        ];
      }

      return [
        lead(Titles.descriptions.overview),
        heading({
          title: Titles.sections.entrypoints,
          id: "entrypoints",
          depth: headingDepth.page,
        }),
        ...entrypoints,
        ...shared,
      ];
    });

/** A page as MDAST, in reading order, with an id on each heading a link can target. */
export const toMdast =
  (output: Output.Output) =>
  (page: Tree.Page.Page): Written<Root> =>
    Match.value(page).pipe(
      Match.discriminatorsExhaustive("type")({
        module: modulePage(output),
        traits: ({ traits }) =>
          pipe(
            traits,
            Array.map(trait(output)),
            Result.all,
            Result.map((written) =>
              Array.prepend(
                Array.flatten(written),
                lead(Titles.descriptions.traits),
              ),
            ),
          ),
        overview: overview(output),
      }),
      Result.map((children): Root => ({ type: "root", children })),
    );

// oxlint-disable-next-line max-params -- `mdast-util-to-markdown` calls a handler with the node, its parent, the state and the position
const headingMarkdown: Handle = (node: Heading, parent, state, info) => {
  const id = node.data?.hProperties?.id;
  if (typeof id !== "string") {
    return markdownHandlers.heading(node, parent, state, info);
  }

  const anchor: Html = { type: "html", value: anchorOf(id) };

  return markdownHandlers.heading(
    Struct.assign(node, { children: Array.prepend(node.children, anchor) }),
    parent,
    state,
    info,
  );
};

/** A page as Markdown, under its title. Each heading and member starts with an HTML anchor carrying its id, so a link to it has a target. */
export const toMarkdown =
  (output: Output.Output) =>
  ({
    page,
    title,
  }: {
    readonly page: Tree.Page.Page;
    readonly title: string;
  }): Written<string> =>
    toMdast(output)(page).pipe(
      Result.map((tree) =>
        mdastToMarkdown(
          {
            type: "root",
            children: Array.prepend(tree.children, {
              type: "heading",
              depth: 1,
              children: [Content.text(title)],
            }),
          },
          { handlers: { heading: headingMarkdown } },
        ),
      ),
    );
