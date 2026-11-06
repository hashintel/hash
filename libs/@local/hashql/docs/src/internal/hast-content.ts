import {
  Array,
  HashMap,
  Option,
  Predicate,
  Record,
  Result,
  pipe,
} from "effect";
import { SymbolFlags } from "typescript/async";

import * as AST from "../AST/index.js";
import * as Tree from "../Tree/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Output from "./output.js";

import type * as Code from "../Code.js";
import type { Element, ElementContent, Properties } from "hast";

type Written<A> = Result.Result<A, Output.Failure>;

/** An element the host draws with its own component, named `api-<name>`. Absent properties are left out. */
export const element =
  (name: string) =>
  (properties: Properties, children: readonly ElementContent[]): Element => ({
    type: "element",
    tagName: `api-${name}`,
    properties: Record.filter(properties, Predicate.isNotUndefined),
    children: Array.copy(children),
  });

export const text = (value: string): ElementContent => ({
  type: "text",
  value,
});

/** A paragraph of `children`. */
export const paragraph = (children: readonly ElementContent[]): Element => ({
  type: "element",
  tagName: "p",
  properties: {},
  children: Array.copy(children),
});

const inlineCode = (value: string): ElementContent => ({
  type: "element",
  tagName: "code",
  properties: {},
  children: [text(value)],
});

/** What an external symbol declares, by its flags. A class or an interface comes before a namespace merged with it. */
const externalKinds = [
  [SymbolFlags.Class, "class"],
  [SymbolFlags.Interface, "interface"],
  [SymbolFlags.TypeAlias, "type"],
  [SymbolFlags.Enum, "enum"],
  [SymbolFlags.Function, "function"],
  [SymbolFlags.Variable, "const"],
  [SymbolFlags.Module, "module"],
] as const;

/** The kind of what `target` names, which colours a link whose label is code. */
const kindOf =
  (output: Output.Output) =>
  (target: AST.Reference.Reference.Target): Option.Option<Tree.Row.Kind> => {
    if (target._tag === "External") {
      return pipe(
        externalKinds,
        Array.findFirst(([flag]) =>
          TypeScript.Symbol.hasFlag(target.symbol, flag),
        ),
        Option.map(([, kind]) => kind),
      );
    }

    const { document } = output;
    const owner = HashMap.get(document.owners, target.node);
    if (Option.isSome(owner)) {
      return HashMap.get(document.entries, owner.value).pipe(
        Option.flatMap(({ members }) =>
          Array.findFirst(members, ({ id }) => id === target.node),
        ),
        Option.map(({ type }) => type),
      );
    }

    return document.catalogue.ast
      .narrow(target.node, AST.Declaration.isDeclaration)
      .pipe(
        Option.flatMap((id) => HashMap.get(document.entries, id)),
        Option.map(({ kind }) => kind),
      );
  };

/** A link to `href` labelled with code, which takes the colour of the kind of what `target` names. */
export const codeLink =
  (output: Output.Output) =>
  ({
    target,
    href,
    label,
  }: {
    readonly target: AST.Reference.Reference.Target;
    readonly href: string;
    readonly label: string;
  }): ElementContent => ({
    type: "element",
    tagName: "a",
    properties: {
      href,
      dataKind: Option.getOrUndefined(kindOf(output)(target)),
    },
    children: [inlineCode(label)],
  });

/** The overloads something holds in, as an element's `overloads` property, which is absent when it holds in every overload. */
export const overloads = (
  applies: Tree.Callable.Applies,
): Properties["overloads"] =>
  pipe(
    Output.overloads(applies),
    Option.map(Array.map((value): number => value)),
    Option.getOrUndefined,
  );

/** One name of printed code: an `a` to its destination, or a `span` that carries its quick info. */
const nameOf =
  (output: Output.Output) =>
  (name: Code.Name, spelling: string): Written<ElementContent> => {
    if (name._tag === "Hover") {
      return Result.succeed({
        type: "element",
        tagName: "span",
        properties: { title: name.quickInfo },
        children: [text(spelling)],
      });
    }

    // A name whose reference has no destination, such as a type parameter's, carries only its quick info.
    return Result.succeed(
      Option.match(Output.link(output)(name.reference), {
        onNone: (): ElementContent => ({
          type: "element",
          tagName: "span",
          properties: { title: Option.getOrUndefined(name.quickInfo) },
          children: [text(spelling)],
        }),
        onSome: (href): ElementContent => ({
          type: "element",
          tagName: "a",
          properties: {
            href,
            dataKind: Option.getOrUndefined(
              kindOf(output)(name.reference.target),
            ),
            title: Option.getOrUndefined(name.quickInfo),
          },
          children: [text(spelling)],
        }),
      }),
    );
  };

/** Code with an `a` around each linked name and a `span` around each other name with quick info, so a page drawn without the host's components still reads as code with links. */
export const code =
  (output: Output.Output) =>
  ({
    source,
    language,
    context,
  }: {
    readonly source: Code.Source;
    readonly language: Option.Option<string>;
    readonly context: Option.Option<"type" | "member">;
  }): Written<Element> =>
    Result.gen(function* () {
      const { text: value, names } = source;
      const pieces: ElementContent[] = [];
      let end = 0;
      for (const name of names) {
        pieces.push(text(value.slice(end, name.offset)));
        end = name.offset + name.length;
        pieces.push(yield* nameOf(output)(name, value.slice(name.offset, end)));
      }
      pieces.push(text(value.slice(end)));

      return element("code")(
        {
          lang: Option.getOrUndefined(language),
          context: Option.getOrUndefined(context),
        },
        Array.filter(
          pieces,
          (piece) => piece.type !== "text" || piece.value !== "",
        ),
      );
    });

const labelOf = (
  node: Tree.Prose.Text | Tree.Prose.InlineCode,
): ElementContent => {
  if (node.type === "text") {
    return text(node.value);
  }

  return inlineCode(node.value);
};

/** Phrasing as hast. A link whose reference has no destination, such as a private declaration's, reads as its label. */
export const phrasing =
  (output: Output.Output) =>
  (node: Tree.Prose.Phrasing): Written<ElementContent[]> => {
    if (node.type !== "link") {
      return Result.succeed([labelOf(node)]);
    }

    const { destination } = node;
    const children = Array.map(node.children, labelOf);
    // A link whose label is code takes the colour of what it names.
    let kind = Option.none<string>();
    if (
      !(destination instanceof URL) &&
      node.children.length === 1 &&
      node.children[0]?.type === "inlineCode"
    ) {
      kind = kindOf(output)(destination.target);
    }

    return Result.succeed(
      Option.match(Output.destination(output)(destination), {
        onNone: () => children,
        onSome: (href): ElementContent[] => [
          {
            type: "element",
            tagName: "a",
            properties: { href, dataKind: Option.getOrUndefined(kind) },
            children,
          },
        ],
      }),
    );
  };

const block =
  (output: Output.Output) =>
  (node: Tree.Prose.Block): Written<ElementContent> => {
    if (node.type === "code") {
      return Result.succeed(
        element("code")({ lang: Option.getOrUndefined(node.language) }, [
          text(node.value),
        ]),
      );
    }

    return pipe(
      node.children,
      Array.map(phrasing(output)),
      Result.all,
      Result.map((children): ElementContent => ({
        type: "element",
        tagName: "p",
        properties: {},
        children: Array.flatten(children),
      })),
    );
  };

export const blocks =
  (output: Output.Output) =>
  (nodes: readonly Tree.Prose.Block[]): Written<ElementContent[]> =>
    Result.all(Array.map(nodes, block(output)));

/** A list of names as an element's property. A host's hast-to-jsx joins an array property with spaces, and a name may contain one, so the property holds the list as JSON. */
export const names = (value: readonly string[]): string =>
  JSON.stringify(value);

/** A flag as an element's property, left out when it is false. */
export const flag = (value: boolean): true | undefined =>
  value ? true : undefined;

/** The facts a declaration states, as an element's properties. */
export const facts = (value: Output.Facts): Properties => ({
  since: Option.getOrUndefined(value.since),
  stability: Option.getOrUndefined(value.stability),
  internal: flag(value.internal),
  deprecated: flag(value.deprecated),
  source: Option.getOrUndefined(value.source),
});

/** An optional section as the element `name`, or nothing. */
const section =
  (output: Output.Output) =>
  (
    name: string,
    value: Option.Option<{ readonly children: readonly Tree.Prose.Block[] }>,
  ): Written<Element[]> =>
    pipe(
      Option.toArray(value),
      Array.map(({ children }) =>
        blocks(output)(children).pipe(
          Result.map((content) => element(name)({}, content)),
        ),
      ),
      Result.all,
    );

const example =
  (output: Output.Output) =>
  (value: Tree.Comment.Example): Written<Element> =>
    Result.gen(function* () {
      const caption = yield* pipe(
        value.caption,
        Option.map(({ children }) =>
          Result.all(Array.map(children, phrasing(output))).pipe(
            Result.map((content) =>
              element("caption")({}, Array.flatten(content)),
            ),
          ),
        ),
        Result.transposeOption,
      );
      const printed = yield* Option.match(value.program, {
        onNone: () =>
          Result.succeed<Code.Source>({ text: value.code, names: [] }),
        onSome: output.printed.example,
      });
      const written = yield* code(output)({
        source: printed,
        language: value.language,
        context: Option.none(),
      });

      return element("example")({}, [...Option.toArray(caption), written]);
    });

/** Sections of one source comment, each as its own element. */
type Part = (
  output: Output.Output,
) => (value: Tree.Comment.Comment) => Written<Element[]>;

/** A comment's deprecation and description. */
const leadOf: Part = (output) => (value) =>
  Result.all([
    section(output)("deprecation", value.facts.deprecation),
    section(output)("description", value.description),
  ]).pipe(Result.map(Array.flatten));

/** A comment's remarks and custom blocks. */
const detailsOf: Part = (output) => (value) =>
  Result.gen(function* () {
    const custom = yield* pipe(
      value.custom,
      Array.map(({ tag, children }) =>
        blocks(output)(children).pipe(
          Result.map((content) => element("custom")({ tag }, content)),
        ),
      ),
      Result.all,
    );

    return [...(yield* section(output)("remarks", value.remarks)), ...custom];
  });

const examplesOf: Part = (output) => (value) =>
  Result.all(Array.map(value.examples, example(output)));

const seeOf: Part = (output) => (value) =>
  pipe(
    value.see,
    Array.map((each) => section(output)("see", Option.some(each))),
    Result.all,
    Result.map(Array.flatten),
  );

/** The sections `part` writes of a comment, inside one element that names the overloads the comment documents, or nothing when the comment has none of them. */
const within =
  (part: Part) =>
  (output: Output.Output) =>
  (value: Tree.Comment.Comment): Written<Element[]> =>
    part(output)(value).pipe(
      Result.map((children) => {
        if (children.length === 0) {
          return [];
        }

        return [
          element("comment")({ overloads: overloads(value.applies) }, children),
        ];
      }),
    );

/** A comment's deprecation and description, which lead an entry. */
export const description = within(leadOf);

/** A comment's remarks and custom blocks, which follow an entry's calls. */
export const details = within(detailsOf);

/** A comment's examples, which follow its remarks. */
export const examples = within(examplesOf);

/** A comment's `@see` blocks, which come before an entry's relations. */
export const references = within(seeOf);

/** One source comment and all its sections, for a page, a namespace or a trait that its comment documents as a whole. */
export const comment =
  (output: Output.Output) =>
  (value: Tree.Comment.Comment): Written<Element> =>
    Result.all([
      leadOf(output)(value),
      detailsOf(output)(value),
      examplesOf(output)(value),
      seeOf(output)(value),
    ]).pipe(
      Result.map((children) =>
        element("comment")(
          { overloads: overloads(value.applies) },
          Array.flatten(children),
        ),
      ),
    );

/** The first sentence of a row's summary, as plain text, empty for an undocumented row. */
const summaryOf = (row: Tree.Row.Row): string =>
  pipe(
    row.summary,
    Option.flatMap(Tree.Prose.plain),
    Option.map(Tree.Prose.sentence),
    Option.getOrElse(() => ""),
  );

const row =
  (output: Output.Output) =>
  (value: Tree.Row.Row): Written<Element> =>
    Result.succeed(
      element("row")(
        {
          href: Option.getOrUndefined(Output.row(output)(value)),
          kind: value.kind,
          depth: value.depth,
          names: names(value.label),
          summary: summaryOf(value),
          deprecated: flag(value.deprecated),
        },
        [],
      ),
    );

export const rows =
  (output: Output.Output) =>
  (values: readonly Tree.Row.Row[]): Written<Element[]> =>
    Result.all(Array.map(values, row(output)));
