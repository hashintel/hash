import { DocNodeKind } from "@microsoft/tsdoc";
import {
  Array,
  Function,
  Match,
  Option,
  Result,
  Schema,
  String,
  Struct,
  pipe,
} from "effect";

import * as LinkLookup from "./internal/link-lookup.js";

import type * as AST from "./AST/index.js";
import type * as Tree from "./Tree/index.js";
import type * as TSDoc from "@microsoft/tsdoc";

type Phrasing = Tree.Prose.Phrasing;
type Block = Tree.Prose.Block;

/** What each of a comment's `{@link}`s names: the node of the AST its name resolved to. */
export interface Context {
  readonly target: (
    link: TSDoc.DocLinkTag,
  ) => Option.Option<AST.Target.Interned>;
}

// oxlint-disable-next-line unicorn/throw-new-error -- Schema constructs the tagged error.
export class ProseError extends Schema.TaggedError<ProseError>()("ProseError", {
  reason: Schema.TaggedUnion({
    MissingTarget: { reference: Schema.String },
    UnsupportedScheme: { url: Schema.String },
  }),
}) {}

type Node = {
  readonly [K in DocNodeKind]: InstanceType<(typeof TSDoc)[`Doc${K}`]> & {
    readonly kind: K;
  };
}[DocNodeKind];

const isKind = Schema.is(Schema.Enum(DocNodeKind));
const isNode = (node: TSDoc.DocNode): node is Node => isKind(node.kind);

/** A label's backticks mark code, as they do in the rest of a comment. An unbalanced backtick leaves the label as text. */
const labelText = (
  value: string,
  origin: TSDoc.DocLinkTag | Tree.Prose.Explained,
): (Tree.Prose.Text | Tree.Prose.InlineCode)[] => {
  const parts = value.split("`");
  if (parts.length % 2 === 0) {
    return [{ type: "text", value, origin }];
  }

  return pipe(
    parts,
    Array.map((part, index): Tree.Prose.Text | Tree.Prose.InlineCode => ({
      type: index % 2 === 0 ? "text" : "inlineCode",
      value: part,
      origin,
    })),
    Array.filter(({ value: part }) => part !== ""),
  );
};

/** A link without text reads as the declaration it names, member path included, and a link to an entrypoint as the entrypoint's name. */
const labelOf = (
  link: TSDoc.DocLinkTag,
): (Tree.Prose.Text | Tree.Prose.InlineCode)[] => {
  if (link.linkText !== undefined) {
    return labelText(link.linkText, link);
  }

  const destination = link.codeDestination;
  if (destination === undefined) {
    return [
      { type: "inlineCode", value: link.urlDestination ?? "", origin: link },
    ];
  }

  const label = pipe(
    destination.memberReferences,
    Array.map((member) =>
      Option.fromUndefinedOr(member.memberIdentifier?.identifier),
    ),
    Option.all,
    Option.flatMap((path) => {
      if (Array.isReadonlyArrayNonEmpty(path)) {
        return Option.some(Array.join(path, "."));
      }

      return LinkLookup.entrypointOf(destination);
    }),
  );

  return [
    {
      type: "inlineCode",
      value: Option.getOrElse(label, () => destination.emitAsTsdoc()),
      origin: link,
    },
  ];
};

const missing = (link: TSDoc.DocLinkTag): ProseError =>
  ProseError.make({
    reason: {
      _tag: "MissingTarget",
      reference:
        link.codeDestination?.emitAsTsdoc() ?? link.urlDestination ?? "",
    },
  });

/** Whether a link may write `url`. A reader's browser follows the link, and a scheme such as `javascript:` or `file:` can run a script or open a local file. */
const isWeb = (url: URL): boolean =>
  url.protocol === "http:" || url.protocol === "https:";

/** The node a link's name resolved to, or the web address a URL link writes. */
const destinationOf = (
  context: Context,
  link: TSDoc.DocLinkTag,
): Result.Result<Tree.Prose.Link["destination"], ProseError> => {
  if (link.urlDestination === undefined) {
    return Result.fromOption(context.target(link), () => missing(link));
  }

  const address = link.urlDestination;

  return pipe(
    Option.fromNullishOr(URL.parse(address)),
    Result.fromOption(() => missing(link)),
    Result.filterOrFail(isWeb, () =>
      ProseError.make({
        reason: { _tag: "UnsupportedScheme", url: address },
      }),
    ),
  );
};

const linkOf = (
  context: Context,
  link: TSDoc.DocLinkTag,
): Result.Result<Tree.Prose.Link, ProseError> =>
  pipe(
    destinationOf(context, link),
    Result.map((destination): Tree.Prose.Link => ({
      type: "link",
      destination,
      children: labelOf(link),
      origin: link,
    })),
  );

const textOfNode: (node: Node) => string = Match.type<Node>().pipe(
  Match.discriminators("kind")({
    [DocNodeKind.PlainText]: (node) => node.text,
    [DocNodeKind.EscapedText]: (node) => node.decodedText,
    [DocNodeKind.SoftBreak]: () => "\n",
  }),
  Match.orElse(() => ""),
);

const phrasingOf = (
  context: Context,
): ((node: Node) => Result.Result<Phrasing[], ProseError>) =>
  Match.type<Node>().pipe(
    Match.withReturnType<Result.Result<Phrasing[], ProseError>>(),
    Match.discriminators("kind")({
      [DocNodeKind.PlainText]: (node) =>
        Result.succeed([{ type: "text", value: node.text, origin: node }]),
      [DocNodeKind.EscapedText]: (node) =>
        Result.succeed([
          { type: "text", value: node.decodedText, origin: node },
        ]),
      [DocNodeKind.SoftBreak]: (node) =>
        Result.succeed([{ type: "text", value: "\n", origin: node }]),
      [DocNodeKind.CodeSpan]: (node) =>
        Result.succeed([
          { type: "inlineCode", value: node.code, origin: node },
        ]),
      [DocNodeKind.LinkTag]: (node) =>
        linkOf(context, node).pipe(Result.map(Array.of)),
    }),
    Match.orElse(() => Result.succeed([])),
  );

/**
 * Prose from the nodes of a paragraph or a caption.
 *
 * A `<code>` element reads as code whose origin is its opening tag. Each other node keeps its own origin, so adjacent text stays in the pieces TSDoc parsed.
 */
export const phrasing: {
  (
    context: Context,
  ): (
    nodes: readonly TSDoc.DocNode[],
  ) => Result.Result<readonly Phrasing[], ProseError>;
  (
    nodes: readonly TSDoc.DocNode[],
    context: Context,
  ): Result.Result<readonly Phrasing[], ProseError>;
} = Function.dual(2, (nodes: readonly TSDoc.DocNode[], context: Context) =>
  Result.gen(function* () {
    const prose = phrasingOf(context);
    const output: Phrasing[] = [];
    let code = Option.none<Tree.Prose.InlineCode>();
    for (const node of Array.filter(nodes, isNode)) {
      if (Option.isSome(code)) {
        if (node.kind === DocNodeKind.HtmlEndTag && node.name === "code") {
          output.push(code.value);
          code = Option.none();
        } else {
          code = Option.some(
            Struct.evolve(code.value, {
              value: (value) => value + textOfNode(node),
            }),
          );
        }
      } else if (
        node.kind === DocNodeKind.HtmlStartTag &&
        node.name === "code"
      ) {
        code = Option.some({ type: "inlineCode", value: "", origin: node });
      } else {
        output.push(...(yield* prose(node)));
      }
    }

    output.push(...Option.toArray(code));
    return output;
  }),
);

const isBlank = (node: Phrasing): boolean =>
  node.type === "text" && node.value.trim() === "";

const trimText =
  (trim: (value: string) => string) =>
  (node: Phrasing): Phrasing => {
    if (node.type !== "text") {
      return node;
    }

    return Struct.evolve(node, { value: trim });
  };

/** Drops a paragraph's blank margins and trims the text at its ends, keeping whitespace inside code and between links. */
export const trim = (content: readonly Phrasing[]): Phrasing[] => {
  const nodes = pipe(
    content,
    Array.dropWhile(isBlank),
    Array.reverse,
    Array.dropWhile(isBlank),
    Array.reverse,
  );
  if (!Array.isArrayNonEmpty(nodes)) {
    return [];
  }

  return pipe(
    nodes,
    Array.modifyHeadNonEmpty(trimText(String.trimStart)),
    Array.modifyLastNonEmpty(trimText(String.trimEnd)),
  );
};

/** The paragraphs and fenced code of a section, without its empty paragraphs. */
export const blocks: {
  (
    context: Context,
  ): (section: TSDoc.DocSection) => Result.Result<readonly Block[], ProseError>;
  (
    section: TSDoc.DocSection,
    context: Context,
  ): Result.Result<readonly Block[], ProseError>;
} = Function.dual(2, (section: TSDoc.DocSection, context: Context) =>
  pipe(
    section.nodes,
    Array.filter(isNode),
    Array.map(
      Match.type<Node>().pipe(
        Match.withReturnType<Result.Result<Block[], ProseError>>(),
        Match.discriminators("kind")({
          [DocNodeKind.FencedCode]: (node) =>
            Result.succeed([
              {
                type: "code",
                language: Option.liftPredicate(
                  node.language,
                  String.isNonEmpty,
                ),
                value: node.code,
                origin: node,
              },
            ]),
          [DocNodeKind.Paragraph]: (node) =>
            phrasing(node.nodes, context).pipe(
              Result.map(trim),
              Result.map((children): Block[] =>
                children.length === 0
                  ? []
                  : [{ type: "paragraph", children, origin: node }],
              ),
            ),
        }),
        Match.orElse(() => Result.succeed([])),
      ),
    ),
    Result.all,
    Result.map(Array.flatten),
  ),
);

/** The reference's own explanation of a trait as one paragraph, whose backticks mark code. */
export const explanation = (
  trait: Tree.Prose.Explained,
): Tree.Prose.Paragraph => ({
  type: "paragraph",
  children: labelText(trait.explanation, trait),
  origin: trait,
});
