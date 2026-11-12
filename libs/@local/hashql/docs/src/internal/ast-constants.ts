import { Array, Chunk, Effect, Function, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";
import { SignatureKind } from "typescript/async";

import * as AST from "../AST/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Comments from "./ast-comments.js";
import * as Types from "./ast-type-parser.js";

import type * as Names from "./ast-names.js";
import type { Failure } from "./ast-type-parser.js";
import type { Symbol as CompilerSymbol, Signature } from "typescript/async";

type Requirements =
  | AST.Store
  | Types.TypeParser
  | Names.Reach
  | Comments.CommentParser
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program;

type Parsed<A> = Effect.Effect<A, Failure, Requirements>;

const isCallSource = (
  node: Syntax.Node,
): node is AST.CallSignature.CallSignature["node"] =>
  Syntax.isCallSignatureDeclaration(node) ||
  Syntax.isFunctionDeclaration(node) ||
  Syntax.isFunctionTypeNode(node) ||
  Syntax.isMethodDeclaration(node) ||
  Syntax.isMethodSignatureDeclaration(node);

/** The syntax that declares one of a constant's calls. A call the program cannot trace to such syntax fails the constant. */
const callSourceOf =
  (symbol: CompilerSymbol) =>
  (signature: Signature): Parsed<AST.CallSignature.CallSignature["node"]> =>
    pipe(
      Option.fromUndefinedOr(signature.declaration),
      Option.map(TypeScript.Program.resolve),
      Effect.transposeOption,
      Effect.map((resolved) =>
        Option.filter(Option.flatten(resolved), isCallSource),
      ),
      Effect.flatMap(
        Option.match({
          onNone: () =>
            Effect.fail(
              AST.ParseError.missingDeclaration({ name: symbol.name }),
            ),
          onSome: Effect.succeed,
        }),
      ),
    );

/** Whether `node` is `holder` or lies inside it. */
const within = (node: Syntax.Node, holder: Syntax.Node): boolean => {
  let current = node;

  while (current !== holder && !Syntax.isSourceFile(current)) {
    current = current.parent;
  }

  return current === holder;
};

/**
 * The syntax that may state the calls of a constant's annotation. The annotation states them itself, or a declaration of the package that it names does, as `Draft` does for `Draft<Prelude.Builtin>`.
 *
 * The annotation's arguments bind the type parameters of such a declaration, and its comments are the package's own, so its calls read as the constant's.
 */
const callHolders = Effect.fnUntraced(function* (
  type: AST.TypeNode.Interned,
): Effect.fn.Return<readonly Syntax.Node[], Failure, Requirements> {
  const store = yield* AST.Store;
  const program = yield* TypeScript.Program.Program;
  const annotation = store.get(type);

  if (!AST.TypeReference.isTypeReference(annotation)) {
    return [annotation.node];
  }

  // A declaration the parse is still building is one of the package's, because an item outside it builds at once.
  const named = store.idOf(annotation.target);
  if (
    !store.isPending(named) &&
    AST.ExternalItem.isExternalItem(store.get(named))
  ) {
    return [annotation.node];
  }

  const declarations = yield* program.declarations(annotation.target);

  return [annotation.node, ...declarations];
});

const variableOf = (
  symbol: CompilerSymbol,
  node: Syntax.VariableDeclaration,
): Parsed<AST.ValueDeclaration.ValueDeclaration> =>
  Effect.all({
    type: Types.optional(Option.fromUndefinedOr(node.type)),
    documentation: Comments.documentation(node),
    calls: pipe(
      TypeScript.Checker.getTypeOfSymbol(symbol),
      Effect.flatMap(
        TypeScript.Checker.getSignaturesOfType(SignatureKind.Call),
      ),
      Effect.flatMap(Effect.forEach(callSourceOf(symbol))),
    ),
  }).pipe(
    Effect.bind("holders", ({ type }) =>
      Effect.transposeOption(Option.map(type, callHolders)),
    ),
    Effect.flatMap(
      ({
        type,
        documentation,
        calls,
        holders,
      }): Parsed<AST.ValueDeclaration.ValueDeclaration> => {
        const own = Array.every(calls, (call) =>
          Array.some(
            Option.getOrElse(holders, () => []),
            (holder) => within(call, holder),
          ),
        );

        if (
          Option.isNone(type) ||
          !Array.isReadonlyArrayNonEmpty(calls) ||
          !own
        ) {
          return Effect.succeed(
            AST.ConstantDeclaration.make({ node, type, documentation }),
          );
        }

        return pipe(
          Effect.forEach(calls, Types.call),
          // A constant's comment documents the calls its type states.
          Effect.tap((overloads) =>
            Effect.flatMap(AST.Store, (store) =>
              Comments.checkParameters(
                documentation,
                Array.map(overloads, (id) => store.get(id)),
              ),
            ),
          ),
          Effect.map((overloads) =>
            AST.CallableConstant.make({
              node,
              type: type.value,
              overloads: Chunk.make(...overloads),
              documentation,
            }),
          ),
        );
      },
    ),
  );

/** A constant is callable when its annotation states calls, each traced to the syntax that declares it, in the annotation or in the declaration the annotation names. */
export const variable: {
  (
    node: Syntax.VariableDeclaration,
  ): (symbol: CompilerSymbol) => Parsed<AST.ValueDeclaration.ValueDeclaration>;
  (
    symbol: CompilerSymbol,
    node: Syntax.VariableDeclaration,
  ): Parsed<AST.ValueDeclaration.ValueDeclaration>;
} = Function.dual(2, variableOf);
