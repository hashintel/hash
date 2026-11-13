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

/** Whether the named declaration `holder` states `call` itself: an interface states its call signatures, and an alias the function type it names or the call signatures of the type literal it names. */
const states = (holder: Syntax.Node, call: Syntax.Node): boolean => {
  if (Syntax.isInterfaceDeclaration(holder)) {
    return call.parent === holder;
  }
  if (!Syntax.isTypeAliasDeclaration(holder)) {
    return false;
  }

  let { type } = holder;
  while (Syntax.isParenthesizedTypeNode(type)) {
    ({ type } = type);
  }

  return (
    type === call || (Syntax.isTypeLiteralNode(type) && call.parent === type)
  );
};

/**
 * The declarations of the package that an annotation names, which may state its calls, as `Draft` does for `Draft<Prelude.Builtin>`. An annotation that names none, a `typeof` and a type outside the package have none.
 *
 * The annotation's arguments bind the type parameters of such a type, and its comments are the package's own, so the calls it states itself read as the annotated value's. A call that stands deeper in it, as in a branch of a conditional type or in the constraint of a type parameter, can depend on a type parameter the arguments do not bind. A `typeof` names a value, whose own declaration states and documents its calls.
 */
const namedBy = Effect.fnUntraced(function* (
  type: AST.TypeNode.Interned,
): Effect.fn.Return<readonly Syntax.Node[], Failure, Requirements> {
  const store = yield* AST.Store;
  const program = yield* TypeScript.Program.Program;
  const annotation = store.get(type);

  if (
    !AST.TypeReference.isTypeReference(annotation) ||
    Syntax.isTypeQueryNode(annotation.node)
  ) {
    return [];
  }

  // A declaration the parse is still building is one of the package's, because an item outside it builds at once.
  const named = store.idOf(annotation.target);
  if (
    !store.isPending(named) &&
    AST.ExternalItem.isExternalItem(store.get(named))
  ) {
    return [];
  }

  return yield* program.declarations(annotation.target);
});

/**
 * The calls a constant or a property states, in order: every call of its type `value`, when its annotation states each of them. Any other value states none.
 *
 * An annotation states a call when the syntax that declares the call lies in the annotation, or when the type of the package that the annotation names states it. The calls of a union of function types are not stated: a call of the union must suit every member, and no member's syntax says that.
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
  if (value.isUnionType()) {
    return [];
  }

  const signatures = yield* TypeScript.Checker.getSignaturesOfType(
    value,
    SignatureKind.Call,
  );
  const calls = yield* Effect.forEach(signatures, callSourceOf(name));
  if (calls.length === 0) {
    return [];
  }

  const store = yield* AST.Store;
  const written = store.get(annotation).node;
  const named = yield* namedBy(annotation);
  const own = Array.every(
    calls,
    (call) =>
      within(call, written) ||
      Array.some(named, (holder) => states(holder, call)),
  );
  if (!own) {
    return [];
  }

  return yield* Effect.forEach(calls, Types.call);
});
