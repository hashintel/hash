import { Array, Match, Option, Result, pipe } from "effect";

import * as Import from "../Import.js";
import * as Callable from "./hast-callable.js";
import * as Content from "./hast-content.js";
import * as Relations from "./hast-relations.js";
import * as Output from "./output.js";
import * as Titles from "./titles.js";

import type * as Tree from "../Tree/index.js";
import type { Element, ElementContent, Root } from "hast";

type Written<A> = Result.Result<A, Output.Failure>;

/** A heading a link can target, which the page's outline lists. */
const heading = (title: string, id: string): Element => ({
  type: "element",
  tagName: "h2",
  properties: { id },
  children: [{ type: "text", value: title }],
});

/** One part of every comment on a declaration, in source order. */
const comments =
  (output: Output.Output) =>
  (
    values: readonly Tree.Comment.Comment[],
    part: (
      output: Output.Output,
    ) => (value: Tree.Comment.Comment) => Written<Element[]>,
  ): Written<Element[]> =>
    Result.all(Array.map(values, part(output))).pipe(Result.map(Array.flatten));

/** An optional node as an element, or nothing. */
const optional =
  <A>(write: (value: A) => Written<Element>) =>
  (value: Option.Option<A>): Written<Element[]> =>
    pipe(
      value,
      Option.map(write),
      Result.transposeOption,
      Result.map(Option.toArray),
    );

const signature =
  (output: Output.Output, context: Option.Option<"member">, total: number) =>
  (value: Tree.Declaration.Signature): Written<Element> =>
    output.printed.signature(value.syntax).pipe(
      Result.flatMap((source) =>
        Content.code(output)({ source, language: Option.some("ts"), context }),
      ),
      Result.map((code) =>
        Content.element("signature")(
          {
            overloads: Content.overloads({
              overloads: Array.map(value.overloads, ({ index }) => index),
              total,
            }),
            ...Content.facts(Output.signatureFacts(output)(value)),
          },
          [code],
        ),
      ),
    );

/** Every declaration, after `title`: what the host puts on the line that names them, such as the declaration's type hierarchy. */
const signatures =
  (
    output: Output.Output,
    context: Option.Option<"member">,
    title: readonly Element[],
  ) =>
  (value: Tree.Declaration.Signatures): Written<Element> => {
    const total = Output.count(Option.some(value));

    return pipe(
      value.children,
      Array.map(signature(output, context, total)),
      Result.all,
      Result.map((children) =>
        Content.element("signatures")({ overloads: total }, [
          ...title,
          ...children,
        ]),
      ),
    );
  };

/** A getter or a setter. Each is a call of its own and names no overloads. */
const half =
  (output: Output.Output, name: "getter" | "setter") =>
  (value: Tree.Declaration.Signature): Written<Element> =>
    signature(
      output,
      Option.some("member"),
      value.overloads.length,
    )(value).pipe(
      Result.map((written) => Content.element(name)({}, [written])),
    );

const declared =
  (output: Output.Output) =>
  (value: Tree.Member.Member): Written<Element[]> => {
    if (value.type === "accessor") {
      return Result.all([
        optional(half(output, "getter"))(value.get),
        optional(half(output, "setter"))(value.set),
      ]).pipe(Result.map(Array.flatten));
    }

    return signatures(
      output,
      Option.some("member"),
      [],
    )(value.signatures).pipe(Result.map(Array.of));
  };

const memberNames = {
  property: "property",
  method: "method",
  accessor: "accessor",
  enumMember: "enum-member",
} as const;

const member =
  (output: Output.Output) =>
  (value: Tree.Member.Member): Written<Element> =>
    Result.gen(function* () {
      const each = comments(output);
      const parts = Array.flatMap(
        Option.toArray(Output.signaturesOf(value)),
        ({ children }) => children,
      );
      let calls: Element[] = [];
      if (value.type === "method") {
        calls = yield* Callable.callable(output)(value);
      }

      return Content.element(memberNames[value.type])(
        {
          name: Output.memberId(output)(value),
          title: value.name,
          static: Content.flag(value.static),
          ...Content.facts(
            Output.leading(output)({
              comments: value.comments,
              signatures: parts,
            }),
          ),
          deprecated: Content.flag(value.deprecated),
        },
        [
          ...(yield* declared(output)(value)),
          ...(yield* each(value.comments, Content.description)),
          ...calls,
          ...(yield* each(value.comments, Content.details)),
          ...(yield* each(value.comments, Content.examples)),
          ...(yield* each(value.comments, Content.references)),
        ],
      );
    });

/**
 * An export's parts in the order of its Markdown body. The descriptions of its comments come first, and their other sections follow its members and calls.
 *
 * Each part of a comment is an element of its own that names the overloads the comment documents.
 */
const exported =
  (output: Output.Output) =>
  (value: Tree.Export.Export): Written<Element> =>
    Result.gen(function* () {
      const each = comments(output);
      const place = Output.place(output)(value);
      const hierarchyIn = (slot: "title" | "header"): Written<Element[]> =>
        optional(Relations.hierarchy({ output, name: place.id, slot }))(
          value.hierarchy,
        );
      const declarations = yield* Option.match(value.signatures, {
        onNone: () => hierarchyIn("header"),
        onSome: (declared) =>
          hierarchyIn("title").pipe(
            Result.flatMap((title) =>
              signatures(output, Option.none(), title)(declared),
            ),
            Result.map(Array.of),
          ),
      });
      const members = yield* Result.all(
        Array.map(value.members, member(output)),
      );
      const parts = Array.flatMap(
        Option.toArray(value.signatures),
        ({ children }) => children,
      );
      const namespace = yield* optional((space: Tree.Export.Namespace) =>
        Result.gen(function* () {
          const rows = yield* Content.rows(output)(space.index);
          const nested = yield* Result.all(
            Array.map(space.exports, exported(output)),
          );
          const own = yield* optional(Content.comment(output))(space.comment);

          return Content.element("namespace")(
            {
              title: place.title,
              ...Content.facts(
                Output.facts(output)({
                  facts: Option.map(space.comment, ({ facts }) => facts),
                  origin: Option.some(space.origin),
                }),
              ),
            },
            [
              ...own,
              ...Array.map(
                Option.toArray(
                  Option.liftPredicate(rows, Array.isReadonlyArrayNonEmpty),
                ),
                (children) => Content.element("index")({}, children),
              ),
              ...nested,
            ],
          );
        }),
      )(value.namespace);

      return Content.element("export")(
        {
          name: place.id,
          title: place.title,
          names: Content.names(place.names),
          kind: value.kind,
          ...Content.facts(
            Output.leading(output)({
              comments: value.comments,
              signatures: parts,
            }),
          ),
          deprecated: Content.flag(value.deprecated),
        },
        [
          ...(yield* each(value.comments, Content.description)),
          ...declarations,
          ...(yield* Relations.related(output)(
            value.related,
            Relations.traits,
          )),
          ...Array.map(
            Option.toArray(
              Option.liftPredicate(members, Array.isReadonlyArrayNonEmpty),
            ),
            (children) => Content.element("members")({}, children),
          ),
          ...(yield* Callable.callable(output)(value)),
          ...(yield* each(value.comments, Content.details)),
          ...(yield* each(value.comments, Content.examples)),
          ...(yield* each(value.comments, Content.references)),
          ...(yield* Relations.related(output)(value.related, Relations.uses)),
          ...namespace,
        ],
      );
    });

const group =
  (output: Output.Output) =>
  ({ grouping, rows }: Tree.Page.Group): Written<Element> =>
    Content.rows(output)(rows).pipe(
      Result.map((written) =>
        Content.element("group")(
          { title: Titles.grouping(grouping), grouping: grouping._tag },
          written,
        ),
      ),
    );

const modulePage =
  (output: Output.Output) =>
  (page: Tree.Page.Module): Written<ElementContent[]> =>
    Result.gen(function* () {
      const own = yield* optional(Content.comment(output))(page.comment);
      const contents = yield* pipe(
        page.groups,
        Array.filter(({ rows }) => rows.length > 0),
        Array.map(group(output)),
        Result.all,
      );
      const groups = yield* pipe(
        page.groups,
        Array.flatMap((each) =>
          Array.map(Option.toArray(Output.groupId(output)(page, each)), (id) =>
            Result.all(Array.map(each.exports, exported(output))).pipe(
              Result.map((written) => [
                heading(Titles.grouping(each.grouping), id),
                ...written,
              ]),
            ),
          ),
        ),
        Result.all,
        Result.map(Array.flatten),
      );
      const importCode = yield* Content.code(output)({
        source: { text: Import.print(page.import), names: [] },
        language: Option.some("ts"),
        context: Option.none(),
      });
      let index: Element[] = [];
      if (contents.length > 0) {
        index = [
          heading(Titles.sections.index, Output.indexId(output)(page)),
          Content.element("contents")({}, contents),
        ];
      }

      return [
        Content.element("meta")(
          {
            kind: page.kind,
            exports: Array.fromIterable(page.namespace.exports).length,
            ...Content.facts(
              Output.facts(output)({
                facts: Option.map(page.comment, ({ facts }) => facts),
                origin: Option.some(page.namespace),
              }),
            ),
          },
          [],
        ),
        ...own,
        Content.element("import")({}, [importCode]),
        ...index,
        ...groups,
      ];
    });

/** A page's first paragraph, for a page the reference makes itself. */
const lead = (value: string): Element =>
  Content.element("description")({}, [
    Content.paragraph([Content.text(value)]),
  ]);

const description =
  (output: Output.Output) =>
  (value: Tree.Trait.Trait["description"]): Written<Element> => {
    if (value.type === "comment") {
      return Content.comment(output)(value);
    }

    return Content.blocks(output)(value.children).pipe(
      Result.map((children) => Content.element("explanation")({}, children)),
    );
  };

/** The paragraph after a trait's description, which names its declaration and the guide that explains it. */
const whereDeclared =
  (output: Output.Output) =>
  (value: Tree.Trait.Trait): Element[] => {
    const pieces = Titles.traitPieces({
      trait: value,
      declaration: Output.href(output)(value.origin),
      external: Option.isSome(Output.external(output)(value.origin)),
    });
    const children = Array.map(
      pieces,
      Titles.matchPiece({
        Text: ({ value: text }) => Content.text(text),
        Declaration: ({ href }) =>
          Content.codeLink(output)({
            target: value.origin,
            href,
            label: value.name,
          }),
        Guide: ({ href, label }): ElementContent => ({
          type: "element",
          tagName: "a",
          properties: { href },
          children: [Content.text(label)],
        }),
      }),
    );

    if (children.length === 0) {
      return [];
    }

    return [Content.paragraph(children)];
  };

const trait =
  (output: Output.Output) =>
  (value: Tree.Trait.Trait): Written<Element> =>
    Result.gen(function* () {
      const name = Output.traitId(output)(value);
      const implementors = yield* Relations.related(output)(
        {
          traits: [],
          implementedBy: value.implementors,
          acceptedBy: [],
          returnedBy: [],
        },
        Relations.uses,
      );

      return Content.element("trait")({ name, title: value.name }, [
        ...(yield* optional(
          Relations.hierarchy({ output, name, slot: "header" }),
        )(value.hierarchy)),
        yield* description(output)(value.description),
        ...whereDeclared(output)(value),
        ...implementors,
      ]);
    });

const overview =
  (output: Output.Output) =>
  (page: Tree.Page.Overview): Written<ElementContent[]> =>
    Result.gen(function* () {
      const entrypoints = yield* Content.rows(output)(page.entrypoints);
      const traits = yield* Content.rows(output)(page.traits);
      let shared: Element[] = [];
      if (traits.length > 0) {
        shared = [
          heading(Titles.sections.traits, "traits"),
          Content.element("index")({}, traits),
        ];
      }

      return [
        lead(Titles.descriptions.overview),
        heading(Titles.sections.entrypoints, "entrypoints"),
        Content.element("index")({}, entrypoints),
        ...shared,
      ];
    });

/** A page's body as hast: the `api-*` elements a host draws with its own components, around the HTML of its prose. */
export const toHast =
  (output: Output.Output) =>
  (page: Tree.Page.Page): Written<Root> =>
    Match.value(page).pipe(
      Match.discriminatorsExhaustive("type")({
        module: modulePage(output),
        traits: ({ traits }) =>
          Result.all(Array.map(traits, trait(output))).pipe(
            Result.map((written): ElementContent[] => [
              lead(Titles.descriptions.traits),
              ...written,
            ]),
          ),
        overview: overview(output),
      }),
      Result.map((children): Root => ({ type: "root", children })),
    );
