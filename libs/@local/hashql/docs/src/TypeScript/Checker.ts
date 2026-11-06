import { Array, Context, Effect, Function, Option, flow } from "effect";
import { SyntaxKind, isCallSignatureDeclaration } from "typescript/ast";
import { NodeBuilderFlags, isClassOrInterfaceType } from "typescript/async";

import type { Cause } from "effect";
import type {
  CallSignatureDeclaration,
  Declaration,
  Node,
  TypeNode,
} from "typescript/ast";
import type {
  Checker as $Checker,
  Symbol as $Symbol,
  DocumentIdentifier,
  IntersectionType,
  Signature,
  SignatureKind,
  Type,
} from "typescript/async";

/** The checker of the program's project. Each question is one request to the API process. */
export class Checker extends Context.Service<Checker, Checker.Shape>()(
  "@local/hashql-docs/TypeScript/Checker",
) {}

export declare namespace Checker {
  export interface Shape {
    readonly getSymbolOfSourceFile: (
      file: DocumentIdentifier,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    readonly getSymbolOfDeclaration: (
      declaration: Declaration,
    ) => Effect.Effect<$Symbol, Cause.UnknownError>;
    readonly getSymbolOfNode: (
      node: Node,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    readonly getExportsOfModule: (
      symbol: $Symbol,
    ) => Effect.Effect<readonly $Symbol[], Cause.UnknownError>;
    readonly getAliasedSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<$Symbol, Cause.UnknownError>;
    /** The symbol an alias names directly, which may be an alias itself, or none for a symbol that is no alias. */
    readonly getImmediateAliasedSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    readonly isUnknownSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<boolean, Cause.UnknownError>;
    readonly getTypeOfSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    readonly getSignaturesOfType: (
      type: Type,
      kind: SignatureKind,
    ) => Effect.Effect<readonly Signature[], Cause.UnknownError>;
    readonly getSymbolAtLocation: (
      nodes: readonly Node[],
    ) => Effect.Effect<readonly Option.Option<$Symbol>[], Cause.UnknownError>;
    /** The type an interface or a class declares, as its own members see it. */
    readonly getDeclaredTypeOfSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** The base types returned by the compiler, excluding a class's implemented interfaces. */
    readonly getBaseTypes: (
      type: Type,
    ) => Effect.Effect<readonly Type[], Cause.UnknownError>;
    /** The symbol that names `type`, such as its interface, or none for an anonymous type. */
    readonly getSymbolOfType: (
      type: Type,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    /** The types an intersection joins. */
    readonly getTypesOfIntersection: (
      type: IntersectionType,
    ) => Effect.Effect<readonly Type[], Cause.UnknownError>;
    /** The type denoted by syntax, including an implemented interface. */
    readonly getTypeAtLocation: (
      node: Node,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** The type of `symbol` where `location` mentions it. */
    readonly getTypeOfSymbolAtLocation: (
      symbol: $Symbol,
      location: Node,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** `type` as syntax the compiler builds for `location`, or none for a type it cannot write. */
    readonly typeToTypeNode: (
      type: Type,
      location: Node,
      flags: NodeBuilderFlags,
    ) => Effect.Effect<Option.Option<TypeNode>, Cause.UnknownError>;
    /** `signature` as the call signature the compiler builds for `location`, such as `<T>(value: T): T`. */
    readonly signatureToDeclaration: (
      signature: Signature,
      location: Node,
    ) => Effect.Effect<
      Option.Option<CallSignatureDeclaration>,
      Cause.UnknownError
    >;
  }
}

/** The module symbol of `file`, or none for a file that is no module. */
export const getSymbolOfSourceFile = (
  file: DocumentIdentifier,
): Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError, Checker> =>
  Effect.flatMap(Checker, (checker) => checker.getSymbolOfSourceFile(file));

/** The symbol the compiler binds `declaration` to. */
export const getSymbolOfDeclaration = (
  declaration: Declaration,
): Effect.Effect<$Symbol, Cause.UnknownError, Checker> =>
  Effect.flatMap(Checker, (checker) =>
    checker.getSymbolOfDeclaration(declaration),
  );

/** The type of the value `symbol` names. */
export const getTypeOfSymbol = (
  symbol: $Symbol,
): Effect.Effect<Type, Cause.UnknownError, Checker> =>
  Effect.flatMap(Checker, (checker) => checker.getTypeOfSymbol(symbol));

/** The call or construct signatures of `type`, by `kind`. */
export const getSignaturesOfType: {
  (
    kind: SignatureKind,
  ): (
    type: Type,
  ) => Effect.Effect<readonly Signature[], Cause.UnknownError, Checker>;
  (
    type: Type,
    kind: SignatureKind,
  ): Effect.Effect<readonly Signature[], Cause.UnknownError, Checker>;
} = Function.dual(2, (type: Type, kind: SignatureKind) =>
  Effect.flatMap(Checker, (checker) => checker.getSignaturesOfType(type, kind)),
);

/**
 * The service over the compiler's `checker`.
 *
 * A checker belongs to a program's project, so `Program.layer` builds it together with the program.
 *
 * @internal
 */
export const make = ({
  checker,
}: {
  readonly checker: $Checker;
}): Checker["Service"] => {
  const request = <A>(
    send: (self: $Checker) => Promise<A>,
  ): Effect.Effect<A, Cause.UnknownError> =>
    Effect.tryPromise(() => send(checker));

  return Checker.of({
    getSymbolOfSourceFile: (file) =>
      request((self) => self.getSymbolOfSourceFile(file)).pipe(
        Effect.map(Option.fromUndefinedOr),
      ),
    getSymbolOfDeclaration: (declaration) =>
      request((self) => self.getSymbolOfDeclaration(declaration)),
    getSymbolOfNode: (node) =>
      request((self) => self.getSymbolOfNode(node)).pipe(
        Effect.map(Option.fromUndefinedOr),
      ),
    getExportsOfModule: (symbol) =>
      request((self) => self.getExportsOfModule(symbol)),
    getAliasedSymbol: (symbol) =>
      request((self) => self.getAliasedSymbol(symbol)),
    getImmediateAliasedSymbol: (symbol) =>
      request((self) => self.getImmediateAliasedSymbol(symbol)).pipe(
        Effect.map(Option.fromUndefinedOr),
      ),
    isUnknownSymbol: (symbol) =>
      request((self) => self.isUnknownSymbol(symbol)),
    getTypeOfSymbol: (symbol) =>
      request((self) => self.getTypeOfSymbol(symbol)),
    getSignaturesOfType: (type, kind) =>
      request((self) => self.getSignaturesOfType(type, kind)),
    getSymbolAtLocation: (nodes) =>
      request((self) => self.getSymbolAtLocation(nodes)).pipe(
        Effect.map(Array.map(Option.fromUndefinedOr)),
      ),
    getDeclaredTypeOfSymbol: (symbol) =>
      request((self) => self.getDeclaredTypeOfSymbol(symbol)),
    getBaseTypes: (type) => {
      if (!isClassOrInterfaceType(type)) {
        return Effect.succeed([]);
      }

      return request((self) => self.getBaseTypes(type));
    },
    getSymbolOfType: (type) =>
      Effect.tryPromise(() => type.getSymbol()).pipe(
        Effect.map(Option.fromUndefinedOr),
      ),
    getTypesOfIntersection: (type) => Effect.tryPromise(() => type.getTypes()),
    getTypeAtLocation: (node) =>
      request((self) => self.getTypeAtLocation(node)),
    getTypeOfSymbolAtLocation: (symbol, location) =>
      request((self) => self.getTypeOfSymbolAtLocation(symbol, location)),
    typeToTypeNode: (type, location, flags) =>
      request((self) => self.typeToTypeNode(type, location, flags)).pipe(
        Effect.map(Option.fromUndefinedOr),
      ),
    signatureToDeclaration: (signature, location) =>
      request((self) =>
        self.signatureToSignatureDeclaration(
          signature,
          SyntaxKind.CallSignature,
          location,
          NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope,
        ),
      ).pipe(
        Effect.map(
          flow(
            Option.fromUndefinedOr,
            Option.filter(isCallSignatureDeclaration),
          ),
        ),
      ),
  });
};
