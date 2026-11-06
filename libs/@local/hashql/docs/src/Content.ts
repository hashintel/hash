import { Array, Function, Option, Result, String, pipe } from "effect";

import * as Prose from "./Prose.js";

import type * as AST from "./AST/index.js";
import type * as Tree from "./Tree/index.js";
import type { DocSection } from "@microsoft/tsdoc";
import type { SourceFile } from "typescript/ast";

/** A comment's documentation, which every owner of the comment shares. Which overloads it documents is each owner's to say. */
export interface Content extends Omit<Tree.Comment.Comment, "applies"> {}

/** What a comment's prose needs from the AST: the target of each link, and the program of each TypeScript example. */
export interface Context extends Prose.Context {
  readonly program: (
    example: AST.Documentation.Example.Example,
  ) => Option.Option<SourceFile>;
}

export type Failure = Prose.ProseError;

/** The context the AST holds: the node each link names, and the program the parser compiled each example as. */
export const contextOf = (ast: AST.Store["Service"]): Context => ({
  target: (link) =>
    Option.map(ast.nameOf(link), ({ target }) => ast.idOf(target)),
  program: (example) => ast.programOf(example),
});

const sectionOf =
  <Type extends string>(type: Type, context: Context) =>
  <Origin extends { readonly content: DocSection }>(
    origin: Origin,
  ): Result.Result<
    Option.Option<{
      readonly type: Type;
      readonly origin: Origin;
      readonly children: readonly Tree.Prose.Block[];
    }>,
    Prose.ProseError
  > =>
    Prose.blocks(origin.content, context).pipe(
      Result.map((children) =>
        Option.liftPredicate({ type, origin, children }, () =>
          Array.isReadonlyArrayNonEmpty(children),
        ),
      ),
    );

const exampleOf =
  (context: Context) =>
  (
    example: AST.Documentation.Example.Example,
  ): Result.Result<Tree.Comment.Example, Failure> =>
    Result.gen(function* () {
      const caption = yield* pipe(
        example.caption,
        Option.map((origin) =>
          Prose.phrasing(origin.content, context).pipe(
            Result.map((children): Tree.Comment.Caption => ({
              type: "caption",
              children: Prose.trim(children),
              origin,
            })),
          ),
        ),
        Result.transposeOption,
      );

      return {
        type: "example",
        caption,
        language: Option.liftPredicate(example.language, String.isNonEmpty),
        code: example.code,
        program: context.program(example),
        origin: example,
      };
    });

/** Distils a comment's sections and facts from its documentation. */
export const fromDocumentation: {
  (
    context: Context,
  ): (
    documentation: AST.Documentation.Documentation,
  ) => Result.Result<Content, Failure>;
  (
    documentation: AST.Documentation.Documentation,
    context: Context,
  ): Result.Result<Content, Failure>;
} = Function.dual(
  2,
  (
    documentation: AST.Documentation.Documentation,
    context: Context,
  ): Result.Result<Content, Failure> =>
    Result.gen(function* () {
      const description = yield* Prose.blocks(
        documentation.description,
        context,
      ).pipe(
        Result.map((children) =>
          Option.liftPredicate(
            {
              type: "description" as const,
              children,
              origin: documentation,
            },
            () => Array.isReadonlyArrayNonEmpty(children),
          ),
        ),
      );

      const remarks = yield* pipe(
        documentation.remarks,
        Option.map(sectionOf("remarks", context)),
        Result.transposeOption,
        Result.map(Option.flatten),
      );

      // `@deprecated` marks the declaration whatever prose survives, as `Entry` reads it.
      const deprecation = yield* pipe(
        documentation.deprecated,
        Option.map((origin) =>
          Prose.blocks(origin.content, context).pipe(
            Result.map((children): Tree.Comment.Deprecation => ({
              type: "deprecation",
              origin,
              children,
            })),
          ),
        ),
        Result.transposeOption,
      );

      const see = yield* pipe(
        documentation.see,
        Array.map(sectionOf("see", context)),
        Result.all,
        Result.map(Array.getSomes),
      );

      const custom = yield* pipe(
        documentation.customBlocks,
        Array.map((origin) =>
          sectionOf(
            "custom",
            context,
          )(origin).pipe(
            Result.map(
              Option.map((section) => ({ ...section, tag: origin.tag })),
            ),
          ),
        ),
        Result.all,
        Result.map(Array.getSomes),
      );

      const examples = yield* pipe(
        documentation.examples,
        Array.map(exampleOf(context)),
        Result.all,
      );

      return {
        type: "comment",
        origin: documentation,
        description,
        remarks,
        examples,
        see,
        custom,
        facts: {
          since: Option.map(documentation.since, (origin) => ({
            version: origin.version,
            origin,
          })),
          stability: Option.map(documentation.stability, (origin) => ({
            level: origin.level,
            origin,
          })),
          internal: documentation.internal,
          deprecation,
        },
      };
    }),
);

/** The content of `comment` with the overloads of its owner that it documents. */
export const documenting: {
  (applies: Tree.Callable.Applies): (content: Content) => Tree.Comment.Comment;
  (content: Content, applies: Tree.Callable.Applies): Tree.Comment.Comment;
} = Function.dual(
  2,
  (content: Content, applies: Tree.Callable.Applies): Tree.Comment.Comment => ({
    ...content,
    applies,
  }),
);
