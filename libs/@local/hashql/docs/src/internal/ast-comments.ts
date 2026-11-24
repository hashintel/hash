import { Array, Context, Effect, Layer, Option } from "effect";

import * as AST from "../AST/index.js";
import * as DocumentationError from "../DocumentationError.js";
import * as DocumentationParser from "../DocumentationParser.js";
import * as Links from "./ast-links.js";
import * as DocSource from "./ast/doc-source.js";
import * as Source from "./ast/source.js";

import type { Cause } from "effect";
import type {
  ExportAssignment,
  ExportDeclaration,
  ImportEqualsDeclaration,
  JSDoc,
  Node,
} from "typescript/ast";

type Documentation = AST.Documentation.Interned;

/** Parses each source node's comment into documentation interned in the same graph. A link that names part of a declaration fails the comment. */
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
      DocumentationError.DocumentationError | Cause.UnknownError,
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

/** A statement that exports what another declaration declares. Besides an export declaration, that is an `export default` or `export =` of a name and an exported import alias. */
export type Reexport =
  | ExportDeclaration
  | ExportAssignment
  | ImportEqualsDeclaration;

/**
 * Fails on a comment that `statement` carries, as `export * as Space from "./space.js"` can.
 *
 * A re-export shows the documentation of what it exports, so nothing would show its own comment to a reader. The `@module` comment that leads the file is the file's own, and stays.
 */
export const checkReexport = (
  statement: Reexport,
): Effect.Effect<void, DocumentationError.DocumentationError> =>
  Option.match(Array.head(Source.strayModuleComments(statement)), {
    onSome: (comment) => Effect.fail(stray(comment)),
    onNone: () =>
      Option.match(Source.commentOf(statement), {
        onNone: () => Effect.void,
        onSome: (comment) =>
          Effect.fail(
            DocumentationError.DocumentationError.make({
              file: comment.getSourceFile().fileName,
              reason: { _tag: "ReexportComment", start: comment.getStart() },
            }),
          ),
      }),
  });

/** One parser serves one parse, so a cache in the layer never sees a second graph. */
export const layer = Effect.gen(function* () {
  const parser = yield* DocumentationParser.DocumentationParser;

  // Source nodes can share one comment, such as the declarators of one variable statement. Parsing it again would intern a second, unequal node.
  const parsed = new WeakMap<JSDoc, Documentation>();

  const intern = (
    comment: JSDoc,
  ): Effect.Effect<
    Documentation,
    DocumentationError.DocumentationError | Cause.UnknownError,
    AST.Store
  > => {
    const existing = parsed.get(comment);

    if (existing !== undefined) {
      return Effect.succeed(existing);
    }

    return parser.parse(comment).pipe(
      Effect.tap(Links.check),
      Effect.flatMap(AST.intern),
      Effect.tap((id) =>
        Effect.sync(() => {
          parsed.set(comment, id);
        }),
      ),
    );
  };

  return CommentParser.of({
    documentation: (node) =>
      Option.match(Array.head(Source.strayModuleComments(node)), {
        onSome: (comment) => Effect.fail(stray(comment)),
        onNone: () =>
          Effect.transposeOption(Option.map(Source.commentOf(node), intern)),
      }),
  });
}).pipe(Layer.effect(CommentParser));

/** The documentation of `node`'s own comment, or none when it has none. A malformed comment fails the parse. */
export const documentation = (
  node: Node,
): Effect.Effect<
  Option.Option<Documentation>,
  DocumentationError.DocumentationError | Cause.UnknownError,
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

/** The names a `@param` and a `@typeParam` can document: those of a call, or the type parameters a declaration has itself. */
export type Declared = Pick<
  AST.Signature.Signature,
  "parameters" | "typeParameters"
>;

/** Fails on a `@param` or a `@typeParam` in `documentation` that names nothing in `declared`, because its description would document nothing a reader sees. */
export const checkParameters = Effect.fnUntraced(function* (
  documentation: Option.Option<Documentation>,
  declared: readonly Declared[],
): Effect.fn.Return<void, DocumentationError.DocumentationError, AST.Store> {
  if (Option.isNone(documentation)) {
    return;
  }

  const store = yield* AST.Store;
  const comment = store.get(documentation.value);
  const file = comment.node.getSourceFile().fileName;
  const parameters = Array.flatMap(declared, (signature) =>
    Array.map(Array.fromIterable(signature.parameters), (id) => store.get(id)),
  );
  const typeParameters = Array.flatMap(declared, (signature) =>
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
