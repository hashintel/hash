import { Array, Context, Effect, Function, Option, Struct, flow } from "effect";
import { SymbolFlags, isClassOrInterfaceType } from "typescript/async";

import type { Cause } from "effect";
import type {
  CallSignatureDeclaration,
  ConstructSignatureDeclaration,
  ConstructorTypeNode,
  Declaration,
  Expression,
  FunctionTypeNode,
  Node,
  TypeNode,
} from "typescript/ast";
import type {
  Checker as $Checker,
  Symbol as $Symbol,
  DocumentIdentifier,
  IntersectionType,
  NodeBuilderFlags,
  Signature,
  SignatureKind,
  Type,
  TypeFormatFlags,
  TypeParameter,
  UnionType,
} from "typescript/async";

/** A signature as the syntax the compiler builds for it: a call signature, a construct signature, or the type of a function or of a constructor. */
export type SignatureNode =
  | CallSignatureDeclaration
  | ConstructSignatureDeclaration
  | FunctionTypeNode
  | ConstructorTypeNode;

/** The checker of the program's project. Each question is one request to the API process. */
export class Checker extends Context.Service<Checker, Checker.Shape>()(
  "@local/hashql-docs/TypeScript/Checker",
) {}

export declare namespace Checker {
  /** What the checker knows about a symbol. */
  export interface Symbols {
    readonly getSymbolOfSourceFile: (
      file: DocumentIdentifier,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    readonly getSymbolOfDeclaration: (
      declaration: Declaration,
    ) => Effect.Effect<$Symbol, Cause.UnknownError>;
    readonly getSymbolOfNode: (
      node: Node,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    readonly getSymbolAtLocation: (
      nodes: readonly Node[],
    ) => Effect.Effect<readonly Option.Option<$Symbol>[], Cause.UnknownError>;
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
    /** The symbol that holds `symbol` as a member or an export, or none for a symbol nothing holds. */
    readonly getParentOfSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    /** The symbol `name` resolves to where `location` stands, whatever it means there, or none. */
    readonly resolveName: (
      name: string,
      location: Node,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    readonly getTypeOfSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** The type of `symbol` where `location` mentions it. */
    readonly getTypeOfSymbolAtLocation: (
      symbol: $Symbol,
      location: Node,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** The type an interface or a class declares, as its own members see it. */
    readonly getDeclaredTypeOfSymbol: (
      symbol: $Symbol,
    ) => Effect.Effect<Type, Cause.UnknownError>;
  }

  /** What the checker knows about a type, and the types and signatures it finds in syntax. */
  export interface Types {
    /** The type denoted by syntax, including an implemented interface. */
    readonly getTypeAtLocation: (
      node: Node,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** The type the code around `node` expects of it, such as the type of the parameter that takes an argument, or none where nothing expects one. */
    readonly getContextualType: (
      node: Expression,
    ) => Effect.Effect<Option.Option<Type>, Cause.UnknownError>;
    /** The symbol that names `type`, such as its interface, or none for an anonymous type. */
    readonly getSymbolOfType: (
      type: Type,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    /** The property `name` of `type`, or none for a type without it. */
    readonly getPropertyOfType: (
      type: Type,
      name: string,
    ) => Effect.Effect<Option.Option<$Symbol>, Cause.UnknownError>;
    /** The base types returned by the compiler, excluding a class's implemented interfaces. */
    readonly getBaseTypes: (
      type: Type,
    ) => Effect.Effect<readonly Type[], Cause.UnknownError>;
    /** The types an intersection joins. */
    readonly getTypesOfIntersection: (
      type: IntersectionType,
    ) => Effect.Effect<readonly Type[], Cause.UnknownError>;
    /** The types a union chooses between. */
    readonly getTypesOfUnion: (
      type: UnionType,
    ) => Effect.Effect<readonly Type[], Cause.UnknownError>;
    /** `type` without `null` and `undefined`. */
    readonly getNonNullableType: (
      type: Type,
    ) => Effect.Effect<Type, Cause.UnknownError>;
    /** Whether the compiler accepts a value of the type `source` where it expects `target`. */
    readonly isTypeAssignableTo: (
      source: Type,
      target: Type,
    ) => Effect.Effect<boolean, Cause.UnknownError>;
    /** The type arguments of a reference to a generic type, such as `number` in `Box<number>`. Another type has none. */
    readonly getTypeArguments: (
      type: Type,
    ) => Effect.Effect<readonly Type[], Cause.UnknownError>;
    /** The type parameters a class or an interface declares itself, apart from those of a declaration around it. Another type has none. */
    readonly getLocalTypeParameters: (
      type: Type,
    ) => Effect.Effect<readonly TypeParameter[], Cause.UnknownError>;
    /** The type that `parameter` extends, or none for a parameter without a constraint. */
    readonly getConstraintOfTypeParameter: (
      parameter: TypeParameter,
    ) => Effect.Effect<Option.Option<Type>, Cause.UnknownError>;
    /** The type that `parameter` takes where the code gives no argument, or none for a parameter without a default. */
    readonly getDefaultFromTypeParameter: (
      parameter: TypeParameter,
    ) => Effect.Effect<Option.Option<Type>, Cause.UnknownError>;
    readonly getSignaturesOfType: (
      type: Type,
      kind: SignatureKind,
    ) => Effect.Effect<readonly Signature[], Cause.UnknownError>;
    /** The signature that a call or a `new` expression resolves to. */
    readonly getResolvedSignature: (
      node: Node,
    ) => Effect.Effect<Signature, Cause.UnknownError>;
    /** The signature that a function, a method or another function-like declaration declares. */
    readonly getSignatureFromDeclaration: (
      declaration: Node,
    ) => Effect.Effect<Signature, Cause.UnknownError>;
  }

  /** How the compiler writes a type and a signature. */
  export interface Syntax {
    /** `type` as syntax the compiler builds for `location`, or none for a type it cannot write. */
    readonly typeToTypeNode: (
      type: Type,
      location: Node,
      flags: NodeBuilderFlags,
    ) => Effect.Effect<Option.Option<TypeNode>, Cause.UnknownError>;
    /** `type` as the text the compiler writes for `location`, where it qualifies a name by what the scope of `location` does not already name. Without a location it qualifies no name. */
    readonly typeToString: (
      type: Type,
      location: Option.Option<Node>,
      flags: TypeFormatFlags,
    ) => Effect.Effect<string, Cause.UnknownError>;
    /** `signature` as the syntax the compiler builds for `location`, such as `<T>(value: T): T`, or none for a signature it cannot write as `kind`. */
    readonly signatureToDeclaration: (
      signature: Signature,
      location: Node,
      options: {
        readonly kind: SignatureNode["kind"];
        readonly flags: NodeBuilderFlags;
      },
    ) => Effect.Effect<Option.Option<SignatureNode>, Cause.UnknownError>;
  }

  export interface Shape extends Symbols, Types, Syntax {}
}

/** Every meaning a name can resolve in: a value, a type and a namespace. */
const anyMeaning =
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace;

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

/** One question to the checker in the API process. */
type Request = <A>(
  send: (self: $Checker) => Promise<A>,
) => Effect.Effect<A, Cause.UnknownError>;

const symbols = (request: Request): Checker.Symbols => ({
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
  getSymbolAtLocation: (nodes) =>
    request((self) => self.getSymbolAtLocation(nodes)).pipe(
      Effect.map(Array.map(Option.fromUndefinedOr)),
    ),
  getExportsOfModule: (symbol) =>
    request((self) => self.getExportsOfModule(symbol)),
  getAliasedSymbol: (symbol) =>
    request((self) => self.getAliasedSymbol(symbol)),
  getImmediateAliasedSymbol: (symbol) =>
    request((self) => self.getImmediateAliasedSymbol(symbol)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  isUnknownSymbol: (symbol) => request((self) => self.isUnknownSymbol(symbol)),
  getParentOfSymbol: (symbol) =>
    request((self) => self.getParentOfSymbol(symbol)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  resolveName: (name, location) =>
    request((self) => self.resolveName(name, anyMeaning, location)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  getTypeOfSymbol: (symbol) => request((self) => self.getTypeOfSymbol(symbol)),
  getTypeOfSymbolAtLocation: (symbol, location) =>
    request((self) => self.getTypeOfSymbolAtLocation(symbol, location)),
  getDeclaredTypeOfSymbol: (symbol) =>
    request((self) => self.getDeclaredTypeOfSymbol(symbol)),
});

const types = (request: Request): Checker.Types => ({
  getTypeAtLocation: (node) => request((self) => self.getTypeAtLocation(node)),
  getContextualType: (node) =>
    request((self) => self.getContextualType(node)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  getSymbolOfType: (type) =>
    Effect.tryPromise(() => type.getSymbol()).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  getPropertyOfType: (type, name) =>
    request((self) => self.getPropertyOfType(type, name)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  getBaseTypes: (type) => {
    if (!isClassOrInterfaceType(type)) {
      return Effect.succeed([]);
    }

    return request((self) => self.getBaseTypes(type));
  },
  getTypesOfIntersection: (type) => Effect.tryPromise(() => type.getTypes()),
  getTypesOfUnion: (type) => Effect.tryPromise(() => type.getTypes()),
  getNonNullableType: (type) =>
    request((self) => self.getNonNullableType(type)),
  isTypeAssignableTo: (source, target) =>
    request((self) => self.isTypeAssignableTo(source, target)),
  getTypeArguments: (type) => {
    if (!type.isTypeReference()) {
      return Effect.succeed([]);
    }

    return request((self) => self.getTypeArguments(type));
  },
  getLocalTypeParameters: (type) => {
    if (!isClassOrInterfaceType(type)) {
      return Effect.succeed([]);
    }

    return Effect.tryPromise(() => type.getLocalTypeParameters());
  },
  getConstraintOfTypeParameter: (parameter) =>
    request((self) => self.getConstraintOfTypeParameter(parameter)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  getDefaultFromTypeParameter: (parameter) =>
    request((self) => self.getDefaultFromTypeParameter(parameter)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  getSignaturesOfType: (type, kind) =>
    request((self) => self.getSignaturesOfType(type, kind)),
  getResolvedSignature: (node) =>
    request((self) => self.getResolvedSignature(node)),
  getSignatureFromDeclaration: (declaration) =>
    request((self) => self.getSignatureFromDeclaration(declaration)),
});

const syntax = (request: Request): Checker.Syntax => ({
  typeToTypeNode: (type, location, flags) =>
    request((self) => self.typeToTypeNode(type, location, flags)).pipe(
      Effect.map(Option.fromUndefinedOr),
    ),
  typeToString: (type, location, flags) =>
    request((self) =>
      self.typeToString(type, Option.getOrUndefined(location), flags),
    ),
  signatureToDeclaration: (signature, location, { kind, flags }) =>
    request((self) =>
      self.signatureToSignatureDeclaration(signature, kind, location, flags),
    ).pipe(
      Effect.map(
        flow(
          Option.fromUndefinedOr,
          Option.filter((node): node is SignatureNode => node.kind === kind),
        ),
      ),
    ),
});

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
  const request: Request = (send) => Effect.tryPromise(() => send(checker));

  return Checker.of(
    Struct.assign(
      Struct.assign(symbols(request), types(request)),
      syntax(request),
    ),
  );
};
