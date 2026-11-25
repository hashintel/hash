import { Array, Chunk, Effect, Function, Option } from "effect";

import * as AST from "../AST/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Calls from "./ast-calls.js";
import * as Comments from "./ast-comments.js";
import * as Types from "./ast-type-parser.js";

import type { Failure } from "./ast-type-parser.js";
import type * as Syntax from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

type Requirements = Calls.Requirements | Comments.CommentParser;

const variableOf = Effect.fnUntraced(function* (
  symbol: CompilerSymbol,
  node: Syntax.VariableDeclaration,
): Effect.fn.Return<
  AST.ValueDeclaration.ValueDeclaration,
  Failure,
  Requirements
> {
  const store = yield* AST.Store;
  const type = yield* Types.optional(Option.fromUndefinedOr(node.type));
  const documentation = yield* Comments.documentation(node);
  if (Option.isNone(type)) {
    yield* Comments.checkParameters(documentation, []);

    return AST.ConstantDeclaration.make({ node, type, documentation });
  }

  const value = yield* TypeScript.Checker.getTypeOfSymbol(symbol);
  const overloads = yield* Calls.stated({
    name: symbol.name,
    value,
    annotation: type.value,
  });
  // A constant's comment documents the calls its type states.
  yield* Comments.checkParameters(
    documentation,
    Array.map(overloads, store.get),
  );
  if (!Array.isReadonlyArrayNonEmpty(overloads)) {
    return AST.ConstantDeclaration.make({ node, type, documentation });
  }

  return AST.CallableConstant.make({
    node,
    type: type.value,
    overloads: Chunk.make(...overloads),
    documentation,
  });
});

/** A constant is callable when its annotation states calls, each traced to the syntax that declares it, in the annotation or in the declaration the annotation names. */
export const variable: {
  (
    node: Syntax.VariableDeclaration,
  ): (
    symbol: CompilerSymbol,
  ) => Effect.Effect<
    AST.ValueDeclaration.ValueDeclaration,
    Failure,
    Requirements
  >;
  (
    symbol: CompilerSymbol,
    node: Syntax.VariableDeclaration,
  ): Effect.Effect<
    AST.ValueDeclaration.ValueDeclaration,
    Failure,
    Requirements
  >;
} = Function.dual(2, variableOf);
