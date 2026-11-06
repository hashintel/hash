import { Array, Context, Effect, Layer, Option } from "effect";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";
import * as DocumentationParser from "../DocumentationParser.js";
import * as Links from "./ast-links.js";
import * as References from "./ast-references.js";
import * as DocSource from "./ast/doc-source.js";
import * as Source from "./ast/source.js";

import type { JSDoc, Node } from "typescript/ast";

type Documentation = AST.Documentation.Interned;

/** Parses each source node's comment into documentation interned in the same graph, and records the comment's links for the references to resolve. */
export class CommentParser extends Context.Service<
  CommentParser,
  CommentParser.Shape
>()("@local/hashql-docs/internal/ast-comments/CommentParser") {}

export declare namespace CommentParser {
  export interface Shape {
    /** The documentation of `node`'s own comment, or none when it has none. A malformed comment fails the parse. */
    readonly documentation: (
      node: Node,
    ) => Effect.Effect<
      Option.Option<Documentation>,
      DocumentationError.DocumentationError,
      AST.Store
    >;
  }
}

/** The failure for a `@module` comment that its file does not select, because nothing would show it to a reader. */
const stray = (comment: JSDoc): DocumentationError.DocumentationError =>
  DocumentationError.DocumentationError.make({
    file: comment.getSourceFile().fileName,
    reason: { _tag: "StrayModuleComment", start: comment.getStart() },
  });

/** One parser serves one parse, so a cache in the layer never sees a second graph. */
export const layer = Effect.gen(function* () {
  const parser = yield* DocumentationParser.DocumentationParser;
  const references = yield* References.References;
  // Several source nodes can share one comment, such as the declarators of one variable statement. Parsing it again would intern a second, unequal node. Each owner still registers the comment's links, because a link resolves in its owner's scope.
  const parsed = new WeakMap<
    JSDoc,
    {
      readonly documentation: AST.Documentation.Documentation;
      readonly id: Documentation;
    }
  >();

  const register = (
    documentation: AST.Documentation.Documentation,
    owner: Node,
  ): Effect.Effect<void, DocumentationError.DocumentationError> =>
    Links.register(documentation, owner).pipe(
      Effect.provideService(References.References, references),
    );

  const intern = (
    comment: JSDoc,
    owner: Node,
  ): Effect.Effect<
    Documentation,
    DocumentationError.DocumentationError,
    AST.Store
  > => {
    const existing = parsed.get(comment);

    if (existing !== undefined) {
      return Effect.as(register(existing.documentation, owner), existing.id);
    }

    return parser.parse(comment).pipe(
      Effect.tap((documentation) => register(documentation, owner)),
      Effect.flatMap((documentation) =>
        Effect.tap(AST.intern(documentation), (id) =>
          Effect.sync(() => parsed.set(comment, { documentation, id })),
        ),
      ),
    );
  };

  return CommentParser.of({
    documentation: (node) =>
      Option.match(Array.head(Source.strayModuleComments(node)), {
        onSome: (comment) => Effect.fail(stray(comment)),
        onNone: () =>
          Effect.transposeOption(
            Option.map(Source.commentOf(node), (comment) =>
              intern(comment, node),
            ),
          ),
      }),
  });
}).pipe(Layer.effect(CommentParser));

/** The documentation of `node`'s own comment, or none when it has none. A malformed comment fails the parse. */
export const documentation = (
  node: Node,
): Effect.Effect<
  Option.Option<Documentation>,
  DocumentationError.DocumentationError,
  CommentParser | AST.Store
> => Effect.flatMap(CommentParser, (parser) => parser.documentation(node));

/** The failure for a `@param` or a `@typeParam` block that names nothing. */
const unknown = (
  file: string,
  block:
    | AST.Documentation.Parameter.Parameter
    | AST.Documentation.TypeParameter.TypeParameter,
): DocumentationError.DocumentationError =>
  DocumentationError.DocumentationError.make({
    file,
    reason: {
      _tag:
        block._tag === "Parameter"
          ? "UnknownParameter"
          : "UnknownTypeParameter",
      name: block.name,
      start: Option.match(DocSource.rangeOf(block.node), {
        onNone: () => 0,
        onSome: ({ pos }) => pos,
      }),
    },
  });

/** Fails on a `@param` or a `@typeParam` in `documentation` that names no parameter of `signatures`, because its description would document nothing a reader sees. */
export const checkParameters = Effect.fnUntraced(function* (
  documentation: Option.Option<Documentation>,
  signatures: readonly AST.Signature.Signature[],
): Effect.fn.Return<void, DocumentationError.DocumentationError, AST.Store> {
  if (Option.isNone(documentation)) {
    return;
  }

  const store = yield* AST.Store;
  const comment = store.get(documentation.value);
  const file = comment.node.getSourceFile().fileName;
  const parameters = Array.flatMap(signatures, (signature) =>
    Array.map(Array.fromIterable(signature.parameters), (id) => store.get(id)),
  );
  const typeParameters = Array.flatMap(signatures, (signature) =>
    Array.map(Array.fromIterable(signature.typeParameters), (id) =>
      store.get(id),
    ),
  );

  for (const block of comment.parameters) {
    if (!Array.some(parameters, ({ name }) => name === block.name)) {
      return yield* unknown(file, block);
    }
  }

  for (const block of comment.typeParameters) {
    if (!Array.some(typeParameters, ({ name }) => name === block.name)) {
      return yield* unknown(file, block);
    }
  }
});
