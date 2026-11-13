import { Array, Effect, Function, Option, pipe } from "effect";
import {
  isBindingElement,
  isIdentifier,
  isPropertyAccessExpression,
  isSignatureDeclaration,
  isTypeAliasDeclaration,
  isTypeParameterDeclaration,
} from "typescript/ast";
import { getNameOfDeclaration } from "typescript/ast/utils";
import {
  CheckFlags,
  NodeBuilderFlags,
  SymbolFlags,
  TypeFormatFlags,
  isTypeParameter,
} from "typescript/async";

import * as Checker from "../TypeScript/Checker.js";
import * as Program from "../TypeScript/Program.js";
import * as Symbol from "../TypeScript/Symbol.js";
import * as Location from "./quick-info-location.js";

import type * as QuickInfo from "../QuickInfo.js";
import type { Cause } from "effect";
import type { Declaration, Identifier, Node, TypeNode } from "typescript/ast";
import type {
  Symbol as CompilerSymbol,
  Type,
  TypeParameter,
} from "typescript/async";

type Part = QuickInfo.Line["parts"][number];

/** A type after a name is written in full, where an editor cuts a long one short, with a line for each member of an object type. An alias keeps its name even where the code does not declare it. */
const typeFlags =
  // oxlint-disable-next-line no-bitwise -- `TypeFormatFlags` is the compiler's bit set.
  TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  TypeFormatFlags.UseInstantiationExpressions |
  TypeFormatFlags.MultilineObjectLiterals |
  TypeFormatFlags.NoTruncation;

/** In a type alias the compiler writes the type the alias names, rather than the alias. */
const aliasFlags =
  // oxlint-disable-next-line no-bitwise -- `TypeFormatFlags` is the compiler's bit set.
  TypeFormatFlags.UseAliasDefinedOutsideCurrentScope |
  TypeFormatFlags.UseInstantiationExpressions |
  TypeFormatFlags.MultilineObjectLiterals |
  TypeFormatFlags.NoTruncation |
  TypeFormatFlags.InTypeAlias;

/** Inside a name the compiler writes a type without the names an import gives it, so a type a module exports shows its own name, and it cuts a long type short. */
const nameFlags =
  // oxlint-disable-next-line no-bitwise -- `NodeBuilderFlags` is the compiler's bit set.
  NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
  NodeBuilderFlags.UseOnlyExternalAliasing |
  NodeBuilderFlags.WriteTypeParametersInQualifiedName |
  NodeBuilderFlags.IgnoreErrors;

/** A type as text, as the compiler writes it with `flags` where a name stands. */
const printed = (
  flags: TypeFormatFlags,
): {
  (
    name: Identifier,
  ): (type: Type) => Effect.Effect<string, Cause.UnknownError, Checker.Checker>;
  (
    type: Type,
    name: Identifier,
  ): Effect.Effect<string, Cause.UnknownError, Checker.Checker>;
} =>
  Function.dual(2, (self: Type, name: Identifier) =>
    Effect.flatMap(Checker.Checker, (checker) =>
      checker.typeToString(
        self,
        Option.some(Location.containerOf(name)),
        flags,
      ),
    ),
  );

/** `type` as the compiler writes it after a name where `name` stands. */
export const type = printed(typeFlags);

/** The type a type alias names, as the compiler writes it where `name` stands. */
export const alias = printed(aliasFlags);

/**
 * `type` as the compiler writes it inside a name where `name` stands, as the type argument in `Box<{ a: 1; }>.value`.
 *
 * The compiler has no call that prints a type this way, so the type is the syntax it builds, or the text it writes after a name for a type it cannot build.
 */
const inline: {
  (
    name: Identifier,
  ): (type: Type) => Effect.Effect<Part, Cause.UnknownError, Checker.Checker>;
  (
    type: Type,
    name: Identifier,
  ): Effect.Effect<Part, Cause.UnknownError, Checker.Checker>;
} = Function.dual(
  2,
  Effect.fnUntraced(function* (self: Type, name: Identifier) {
    const checker = yield* Checker.Checker;
    const syntax = yield* checker.typeToTypeNode(
      self,
      Location.containerOf(name),
      nameFlags,
    );

    if (Option.isSome(syntax)) {
      return syntax.value;
    }

    return yield* type(self, name);
  }),
);

/** `type` as the compiler writes it in the type parameters of a declaration, where it qualifies no name. */
const detached = (
  self: Type,
): Effect.Effect<string, Cause.UnknownError, Checker.Checker> =>
  Effect.flatMap(Checker.Checker, (checker) =>
    checker.typeToString(self, Option.none(), typeFlags),
  );

/** `items` in angle brackets with commas between them, as type parameters and type arguments stand after a name, or nothing when there are none. */
const bracketed = <P>(
  items: readonly (readonly P[])[],
): readonly (P | string)[] => {
  if (items.length === 0) {
    return [];
  }

  return Array.flatten([
    ["<"],
    Array.flatten(Array.intersperse(items, [", "])),
    [">"],
  ]);
};

/** How the parts of a type parameter list are written: a type, and the constraint of a parameter. */
interface Writer<P, R> {
  readonly type: (
    type: Type,
  ) => Effect.Effect<P, Cause.UnknownError, Checker.Checker>;
  readonly constraint: (
    parameter: TypeParameter,
  ) => Effect.Effect<Option.Option<P>, Cause.UnknownError, R>;
}

/** The constraint of `parameter` as `write` writes its type, or none for a parameter without one. */
const resolvedConstraint =
  <P>(write: Writer<P, never>["type"]) =>
  (
    parameter: TypeParameter,
  ): Effect.Effect<Option.Option<P>, Cause.UnknownError, Checker.Checker> =>
    Effect.flatMap(Checker.Checker, (checker) =>
      checker
        .getConstraintOfTypeParameter(parameter)
        .pipe(
          Effect.flatMap((constraint) =>
            Effect.transposeOption(Option.map(constraint, write)),
          ),
        ),
    );

/** The constraint of `parameter` as its declaration writes it, or none for a parameter that declares none. */
const declaredConstraint = Effect.fnUntraced(function* (
  parameter: TypeParameter,
) {
  const checker = yield* Checker.Checker;
  const program = yield* Program.Program;
  const symbol = yield* checker.getSymbolOfType(parameter);
  if (Option.isNone(symbol)) {
    return Option.none<TypeNode>();
  }

  const declarations = yield* program.declarations(symbol.value);

  return pipe(
    declarations,
    Array.findFirst(isTypeParameterDeclaration),
    Option.flatMapNullishOr(({ constraint }) => constraint),
  );
});

/** `parameters` in angle brackets, each with its constraint and its default as `writer` writes them, or nothing when there are none. */
const list = Effect.fnUntraced(function* <P, R>(
  parameters: readonly TypeParameter[],
  writer: Writer<P, R>,
) {
  const checker = yield* Checker.Checker;
  const items = yield* Effect.forEach(
    parameters,
    Effect.fnUntraced(function* (parameter) {
      const own = yield* detached(parameter);
      const bound = yield* writer.constraint(parameter);
      const write = writer.type;
      const fallback = yield* checker.getDefaultFromTypeParameter(parameter);
      const initial = yield* Effect.transposeOption(
        Option.map(fallback, write),
      );

      return Array.flatten([
        [own],
        Option.match(bound, {
          onNone: () => [],
          onSome: (part) => [" extends ", part],
        }),
        Option.match(initial, {
          onNone: () => [],
          onSome: (part) => [" = ", part],
        }),
      ]);
    }),
  );

  return bracketed(items);
});

/** Type parameters as the line of a class, an interface or a type alias writes them after its name, each with its constraint and its default, or nothing when there are none. */
export const typeParameters = (
  parameters: readonly TypeParameter[],
): Effect.Effect<string, Cause.UnknownError, Checker.Checker> =>
  Effect.map(
    list(parameters, {
      type: detached,
      constraint: resolvedConstraint(detached),
    }),
    Array.join(""),
  );

/** The type parameters of the first of `declarations` that declares any, where each is a type alias or a function-like declaration. */
export const declaredTypeParameters = Effect.fnUntraced(function* (
  declarations: readonly Declaration[],
) {
  const checker = yield* Checker.Checker;
  const nodes = pipe(
    declarations,
    Array.filter(
      (declaration) =>
        isTypeAliasDeclaration(declaration) ||
        isSignatureDeclaration(declaration),
    ),
    Array.findFirst(({ typeParameters }) =>
      Option.fromUndefinedOr(typeParameters),
    ),
    Option.getOrElse(() => []),
  );
  const types = yield* Effect.forEach(
    nodes,
    Effect.fnUntraced(function* (node) {
      const symbol = yield* checker.getSymbolOfDeclaration(node);

      return yield* checker.getDeclaredTypeOfSymbol(symbol);
    }),
  );

  return Array.filter(types, isTypeParameter);
});

/** The node whose type holds the member `name` names, or none when `name` reads no member of a value. */
const receiverOf = (name: Identifier): Option.Option<Node> => {
  const { parent } = name;
  if (isPropertyAccessExpression(parent) && parent.name === name) {
    return Option.some(parent.expression);
  }

  if (isBindingElement(parent) && parent.propertyName === name) {
    return Option.some(parent.parent);
  }

  return Option.none();
};

/**
 * The type arguments `holder` has where `name` reads a member of it, as `number` in `Box<number>`, or none when the API does not give them.
 *
 * The type of the value that holds the member gives the arguments, whether it is the holder, intersects with it or extends it directly. A generic type extends the holder with arguments the API does not give, so a member inherited through one has none.
 */
const instantiation = Effect.fnUntraced(function* (
  holder: CompilerSymbol,
  name: Identifier,
) {
  const receiver = receiverOf(name);
  if (Option.isNone(receiver)) {
    return Option.none<readonly Type[]>();
  }

  const checker = yield* Checker.Checker;
  const read = yield* checker.getTypeAtLocation(receiver.value);
  const value = yield* checker.getNonNullableType(read);
  let parts: readonly Type[] = [value];
  if (value.isIntersectionType()) {
    parts = yield* checker.getTypesOfIntersection(value);
  }

  const bases = yield* Effect.forEach(parts, checker.getBaseTypes);
  const found = yield* Effect.findFirst(
    Array.appendAll(parts, Array.flatten(bases)),
    (candidate) =>
      Effect.map(
        checker.getSymbolOfType(candidate),
        Option.exists(({ id }) => id === holder.id),
      ),
  );

  return yield* Effect.transposeOption(
    Option.map(found, checker.getTypeArguments),
  );
});

/**
 * How the type parameters of a holder are written where it qualifies a name, as `Box<T extends Space.Kind = string>` in `Box<T extends Space.Kind = string>.value`.
 *
 * The compiler writes a constraint there as its declaration writes it, and a default from its type.
 */
const qualifying = (
  name: Identifier,
): Writer<Part, Checker.Checker | Program.Program> => ({
  type: inline(name),
  constraint: Effect.fnUntraced(function* (parameter) {
    const written = yield* declaredConstraint(parameter);
    if (Option.isSome(written)) {
      return Option.some<Part>(written.value);
    }

    return yield* resolvedConstraint(inline(name))(parameter);
  }),
});

/** What `holder` writes after its name where it qualifies `member`: its type arguments when `member` belongs to an instantiation of it, and the type parameters it declares otherwise. */
const qualification = Effect.fnUntraced(function* (
  holder: CompilerSymbol,
  member: CompilerSymbol,
  name: Identifier,
) {
  const checker = yield* Checker.Checker;

  if (Symbol.hasCheckFlag(member, CheckFlags.Instantiated)) {
    const found = yield* instantiation(holder, name);
    const written = yield* Effect.forEach(
      Option.getOrElse(found, () => []),
      inline(name),
    );

    return bracketed(Array.map(written, Array.of));
  }

  if (
    Symbol.hasFlag(holder, SymbolFlags.Class) ||
    Symbol.hasFlag(holder, SymbolFlags.Interface)
  ) {
    const declared = yield* checker.getDeclaredTypeOfSymbol(holder);
    const parameters = yield* checker.getLocalTypeParameters(declared);

    return yield* list(parameters, qualifying(name));
  }

  if (
    Symbol.hasFlag(holder, SymbolFlags.Function) &&
    holder.valueDeclaration !== undefined
  ) {
    const declaration = yield* Program.resolve(holder.valueDeclaration);
    const parameters = yield* declaredTypeParameters(
      Option.toArray(declaration),
    );

    return yield* list(parameters, qualifying(name));
  }

  return [];
});

/** Whether `symbol` is the type of an object written in place, which has no name to qualify with. */
const isAnonymous = (symbol: CompilerSymbol): boolean =>
  Symbol.hasFlag(symbol, SymbolFlags.TypeLiteral) ||
  Symbol.hasFlag(symbol, SymbolFlags.ObjectLiteral);

/** The symbols that qualify `symbol` where `name` stands, outermost first: the namespaces, classes, interfaces and enums that hold it, up to one the scope of `name` already names. */
const qualifiers: (
  symbol: CompilerSymbol,
  name: Identifier,
) => Effect.Effect<
  readonly CompilerSymbol[],
  Cause.UnknownError,
  Checker.Checker
> = Effect.fnUntraced(function* (symbol: CompilerSymbol, name: Identifier) {
  const checker = yield* Checker.Checker;
  const parent = yield* checker.getParentOfSymbol(symbol);
  if (
    Option.isNone(parent) ||
    isAnonymous(parent.value) ||
    Symbol.isExternalModule(parent.value)
  ) {
    return [];
  }

  const visible = yield* checker.resolveName(symbol.name, name);
  if (Option.exists(visible, ({ id }) => id === symbol.id)) {
    return [];
  }

  const outer = yield* qualifiers(parent.value, name);

  return Array.append(outer, parent.value);
});

/** The name `symbol` declares. The compiler names a default export `default`, and quick info shows the name of its declaration. */
const written = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  if (symbol.name !== "default") {
    return symbol.name;
  }

  const program = yield* Program.Program;
  const declarations = yield* program.declarations(symbol);

  return pipe(
    declarations,
    Array.findFirst((declaration) =>
      Option.fromUndefinedOr(getNameOfDeclaration(declaration)),
    ),
    Option.filter(isIdentifier),
    Option.match({ onNone: () => symbol.name, onSome: ({ text }) => text }),
  );
});

/**
 * The name of `symbol` as quick info writes it where `name` stands, such as `Box<number>.value`.
 *
 * The namespaces, classes, interfaces and enums that hold the symbol qualify it, each with its type arguments or its type parameters. A file is no qualifier, so what a module exports shows its own name.
 */
export const symbol: {
  (
    name: Identifier,
  ): (
    symbol: CompilerSymbol,
  ) => Effect.Effect<
    readonly Part[],
    Cause.UnknownError,
    Checker.Checker | Program.Program
  >;
  (
    symbol: CompilerSymbol,
    name: Identifier,
  ): Effect.Effect<
    readonly Part[],
    Cause.UnknownError,
    Checker.Checker | Program.Program
  >;
} = Function.dual(
  2,
  Effect.fnUntraced(function* (self: CompilerSymbol, name: Identifier) {
    const holders = yield* qualifiers(self, name);
    const members = Array.append(Array.drop(holders, 1), self);
    const qualified = yield* Effect.forEach(
      Array.zip(holders, members),
      Effect.fnUntraced(function* ([holder, member]: readonly [
        CompilerSymbol,
        CompilerSymbol,
      ]) {
        const suffix = yield* qualification(holder, member, name);

        return Array.flatten([[holder.name], suffix, ["."]]);
      }),
    );
    const own = yield* written(self);

    return Array.append(Array.flatten(qualified), own);
  }),
);
