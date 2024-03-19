import { AST } from "@effect/schema";
import { Either, pipe, Stream, Effect, Chunk } from "effect";

import * as EncodeContext from "../internal/EncodeContext.js";
import * as PropertyType from "../PropertyType.js";
import { EncodeError } from "./error.js";
import { PropertyTypeSchema } from "./schema.js";

type Context = EncodeContext.EncodeContext<PropertyType.PropertyType<unknown>>;

type PreparedAST = Exclude<
  AST.AST,
  AST.Refinement | AST.Suspend | AST.Transformation
>;

// TODO: test
const flattenedUnionStream = (
  types: readonly AST.AST[],
  currentContext: Context,
): Stream.Stream<Exclude<AST.AST, AST.Union>, EncodeError> =>
  pipe(
    Stream.make(...types),
    Stream.mapEffect((node) =>
      Effect.gen(function* (_) {
        if (!AST.isUnion(node)) {
          return Stream.make(node);
        }

        const context = yield* _(
          EncodeContext.visit(node, currentContext),
          Either.mapLeft(EncodeError.visit),
        );

        return flattenedUnionStream(node.types, context);
      }),
    ),
    Stream.flatten(),
  );

const flattenUnion = (
  ast: AST.Union,
  currentContext: Context,
): Effect.Effect<AST.AST, EncodeError> =>
  Effect.gen(function* (_) {
    const children = yield* _(
      flattenedUnionStream(ast.types, currentContext),
      Stream.runCollect,
      Effect.map(Chunk.toReadonlyArray),
    );

    return AST.Union.make(children, ast.annotations);
  });

const prepare = (
  ast: AST.AST,
  parentContext: Context,
): Effect.Effect<PreparedAST, EncodeError> =>
  Effect.gen(function* (_) {
    const context = yield* _(
      EncodeContext.visit(ast, parentContext),
      Effect.mapError(EncodeError.visit),
    );

    switch (ast._tag) {
      case "UndefinedKeyword":
      case "Declaration":
      case "Literal":
      case "UniqueSymbol":
      case "VoidKeyword":
      case "NeverKeyword":
      case "UnknownKeyword":
      case "AnyKeyword":
      case "StringKeyword":
      case "NumberKeyword":
      case "BooleanKeyword":
      case "BigIntKeyword":
      case "SymbolKeyword":
      case "ObjectKeyword":
      case "Enums":
      case "TemplateLiteral":
        return ast;
      case "Refinement":
        return yield* _(prepare(ast.from, context));
      case "TupleType":
      case "TypeLiteral":
        return ast;
      case "Union":
        const flat = yield* _(flattenUnion(ast, context));
        return yield* _(prepare(flat, context));
      case "Suspend":
        return yield* _(prepare(ast.f(), context));
      case "Transformation":
        return yield* _(prepare(ast.from, context));
    }
  });

export function encodeSchema(
  ast: AST.AST,
): Effect.Effect<PropertyTypeSchema, EncodeError> {
  throw new Error("Not implemented");
}
