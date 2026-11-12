import { Array, Effect, Option, pipe } from "effect";
import * as Syntax from "typescript/ast";
import { SignatureKind } from "typescript/async";

import * as AST from "../AST/index.js";
import * as TypeScript from "../TypeScript/index.js";
import * as Types from "./ast-type-parser.js";

import type * as Names from "./ast-names.js";
import type { Failure } from "./ast-type-parser.js";
import type { Signature, Type } from "typescript/async";

export type Requirements =
  | AST.Store
  | Types.TypeParser
  | Names.Reach
  | TypeScript.Checker.Checker
  | TypeScript.Program.Program;

type Parsed<A> = Effect.Effect<A, Failure, Requirements>;

type CallSource = AST.CallSignature.CallSignature["node"];

const isCallSource = (node: Syntax.Node): node is CallSource =>
  Syntax.isCallSignatureDeclaration(node) ||
  Syntax.isFunctionDeclaration(node) ||
  Syntax.isFunctionTypeNode(node) ||
  Syntax.isMethodDeclaration(node) ||
  Syntax.isMethodSignatureDeclaration(node);

/** The syntax that declares one of the calls of the value `name`. A call the program cannot trace to such syntax fails the value. */
const callSourceOf =
  (name: string) =>
  (signature: Signature): Parsed<CallSource> =>
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
            Effect.fail(AST.ParseError.missingDeclaration({ name })),
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
 * The syntax that may state the calls of an annotation. The annotation states them itself, or a type of the package that it names does, as `Draft` does for `Draft<Prelude.Builtin>`.
 *
 * The annotation's arguments bind the type parameters of such a type, and its comments are the package's own, so its calls read as the annotated value's. A `typeof` names a value, whose own declaration states and documents its calls.
 */
const callHolders = Effect.fnUntraced(function* (
  type: AST.TypeNode.Interned,
): Effect.fn.Return<readonly Syntax.Node[], Failure, Requirements> {
  const store = yield* AST.Store;
  const program = yield* TypeScript.Program.Program;
  const annotation = store.get(type);

  if (
    !AST.TypeReference.isTypeReference(annotation) ||
    Syntax.isTypeQueryNode(annotation.node)
  ) {
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

/**
 * The calls a constant or a property states, in order: every call of its type `value`, when its annotation states each of them. Any other value states none.
 *
 * An annotation states a call when the syntax that declares the call lies in the annotation, or in the type of the package that the annotation names.
 */
export const stated = Effect.fnUntraced(function* ({
  name,
  value,
  annotation,
}: {
  readonly name: string;
  readonly value: Type;
  readonly annotation: AST.TypeNode.Interned;
}): Effect.fn.Return<
  readonly AST.CallSignature.Interned[],
  Failure,
  Requirements
> {
  const signatures = yield* TypeScript.Checker.getSignaturesOfType(
    value,
    SignatureKind.Call,
  );
  const calls = yield* Effect.forEach(signatures, callSourceOf(name));
  if (calls.length === 0) {
    return [];
  }

  const holders = yield* callHolders(annotation);
  const own = Array.every(calls, (call) =>
    Array.some(holders, (holder) => within(call, holder)),
  );
  if (!own) {
    return [];
  }

  return yield* Effect.forEach(calls, Types.call);
});
