import { Array, Effect, Option, Predicate } from "effect";
import {
  SyntaxKind,
  isExternalModuleReference,
  isImportDeclaration,
  isImportEqualsDeclaration,
  isNamespaceImport,
  isSignatureDeclaration,
  isStringLiteral,
  isTypeAliasDeclaration,
  isTypeReferenceNode,
} from "typescript/ast";
import { SignatureKind, SymbolFlags, isTypeParameter } from "typescript/async";

import * as Checker from "../TypeScript/Checker.js";
import * as Program from "../TypeScript/Program.js";
import * as Symbol from "../TypeScript/Symbol.js";
import * as Location from "./quick-info-location.js";
import * as Text from "./quick-info-text.js";
import * as Values from "./quick-info-values.js";

import type * as Subject from "./quick-info-subject.js";
import type { Identifier, SignatureDeclaration } from "typescript/ast";
import type { Symbol as CompilerSymbol, Type } from "typescript/async";

/** The keyword quick info shows before a class: none for a class expression, which it marks as local. */
const classKeyword = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  if (
    Array.some(
      symbol.declarations,
      ({ kind }) => kind === SyntaxKind.ClassExpression,
    )
  ) {
    return "(local class) ";
  }

  const program = yield* Program.Program;
  const declarations = yield* program.declarations(symbol);
  const abstract = Array.some(declarations, Location.isAbstractClass);

  return abstract ? "abstract class " : "class ";
});

/** A class or an interface, with the type parameters it declares. The class of a `new` expression shows the constructor the expression resolves to. */
export const declared = Effect.fnUntraced(function* (subject: Subject.Subject) {
  const { name, symbol } = subject;
  const checker = yield* Checker.Checker;
  const label = yield* Text.symbol(symbol, name);
  const isClass = Symbol.hasFlag(symbol, SymbolFlags.Class);

  if (isClass && Option.isSome(Location.callOf(name))) {
    const signatures = yield* Values.signaturesAt(
      subject,
      SignatureKind.Construct,
    );
    if (signatures.length === 1) {
      return yield* Values.overloads(
        Values.line("constructor ", label),
        signatures,
        name,
      );
    }
  }

  let keyword = "interface ";
  if (isClass) {
    keyword = yield* classKeyword(symbol);
  }

  const type = yield* checker.getDeclaredTypeOfSymbol(symbol);
  const parameters = yield* checker.getLocalTypeParameters(type);
  const list = yield* Text.typeParameters(parameters);

  return [Values.line(keyword, label, list)];
});

/** An enum. */
export const enumeration = Effect.fnUntraced(function* ({
  name,
  symbol,
}: Subject.Subject) {
  const label = yield* Text.symbol(symbol, name);
  const constant = Symbol.hasFlag(symbol, SymbolFlags.ConstEnum);

  return [Values.line(constant ? "const enum " : "enum ", label)];
});

/** The specifier that the import declaring `alias` names its module by, or none when no import of a whole module declares it. */
const specifierOf = Effect.fnUntraced(function* (alias: CompilerSymbol) {
  const program = yield* Program.Program;
  const declarations = yield* program.declarations(alias);

  return Array.findFirst(declarations, (declaration) => {
    if (
      isNamespaceImport(declaration) &&
      isImportDeclaration(declaration.parent.parent)
    ) {
      return Option.some(declaration.parent.parent.moduleSpecifier);
    }

    if (
      isImportEqualsDeclaration(declaration) &&
      isExternalModuleReference(declaration.moduleReference)
    ) {
      return Option.some(declaration.moduleReference.expression);
    }

    return Option.none();
  }).pipe(
    Option.filter(isStringLiteral),
    Option.map(({ text }) => text),
  );
});

/**
 * A namespace, or a module that is a file.
 *
 * The compiler names a file by its path from the code that reads it, and that path belongs to the machine that built the documentation. A file shows the specifier the code imports it by. Where no import of the whole module names it, it reads as a namespace under the name the code uses.
 */
export const namespace = Effect.fnUntraced(function* ({
  name,
  symbol,
  resolved,
}: Subject.Subject) {
  if (!Symbol.isExternalModule(symbol)) {
    const label = yield* Text.symbol(symbol, name);

    return [Values.line("namespace ", label)];
  }

  const specifier = yield* specifierOf(resolved);

  return [
    Values.line(
      Option.match(specifier, {
        onNone: () => `namespace ${name.text}`,
        onSome: (text) => `module "${text}"`,
      }),
    ),
  ];
});

/**
 * Whether `name` mentions the type parameter `declared` where a conditional type distributes over it.
 *
 * There the compiler reads the parameter as one member of a union at a time, through a type parameter of its own whose constraint is the declared one.
 */
const isDistributed = Effect.fnUntraced(function* (
  name: Identifier,
  parameter: Type,
) {
  if (!isTypeReferenceNode(name.parent)) {
    return false;
  }

  const checker = yield* Checker.Checker;
  const read = yield* checker.getTypeAtLocation(name.parent);
  if (read.id === parameter.id || !isTypeParameter(read)) {
    return false;
  }

  const constraint = yield* checker.getConstraintOfTypeParameter(read);

  return Option.exists(constraint, ({ id }) => id === parameter.id);
});

/** `(type parameter)`, the name of the parameter `symbol` declares and its constraint, as `name` mentions it. */
const typeParameterHead = Effect.fnUntraced(function* ({
  name,
  symbol,
}: Subject.Subject) {
  const checker = yield* Checker.Checker;
  const type = yield* checker.getDeclaredTypeOfSymbol(symbol);
  let constraint = Option.none<Type>();
  if (isTypeParameter(type)) {
    constraint = yield* checker.getConstraintOfTypeParameter(type);
  }

  const bound = yield* Effect.transposeOption(
    Option.map(constraint, Text.type(name)),
  );
  const distributed = yield* isDistributed(name, type);
  const own = `(type parameter) ${distributed ? "(distributed) " : ""}${symbol.name}`;

  return Option.match(bound, {
    onNone: () => own,
    onSome: (text) => `${own} extends ${text}`,
  });
});

/** The name of the function, method or other signature that `declaration` declares, as quick info writes it where `name` stands, or nothing for one that has no name, such as a call signature. */
const functionName = Effect.fnUntraced(function* (
  declaration: SignatureDeclaration,
  name: Identifier,
) {
  if (
    declaration.kind === SyntaxKind.CallSignature ||
    declaration.kind === SyntaxKind.ConstructSignature ||
    !Predicate.hasProperty(declaration, "name") ||
    Predicate.isUndefined(declaration.name)
  ) {
    return [];
  }

  const checker = yield* Checker.Checker;
  const symbol = yield* checker.getSymbolOfDeclaration(declaration);

  return yield* Text.symbol(symbol, name);
});

/** A type parameter, with its constraint and the declaration that introduces it. A class, an interface and a type alias show their name and their type parameters, and a function shows its signature. A mapped type and an `infer` introduce a parameter that no declaration names. */
export const typeParameter = Effect.fnUntraced(function* (
  subject: Subject.Subject,
) {
  const { name, symbol } = subject;
  const checker = yield* Checker.Checker;
  const program = yield* Program.Program;
  const head = yield* typeParameterHead(subject);

  // A class and an interface hold their type parameters as members.
  const holder = yield* checker.getParentOfSymbol(symbol);
  if (Option.isSome(holder)) {
    const label = yield* Text.symbol(holder.value, name);
    const held = yield* checker.getDeclaredTypeOfSymbol(holder.value);
    const parameters = yield* checker.getLocalTypeParameters(held);
    const list = yield* Text.typeParameters(parameters);

    return [Values.line(`${head} in `, label, list)];
  }

  const declarations = yield* program.declarations(symbol);
  const introduced = Array.head(declarations).pipe(
    Option.map(({ parent }) => parent),
  );
  if (Option.isSome(introduced) && isTypeAliasDeclaration(introduced.value)) {
    const alias = yield* checker.getSymbolOfDeclaration(introduced.value);
    const label = yield* Text.symbol(alias, name);
    const parameters = yield* Text.declaredTypeParameters([introduced.value]);
    const list = yield* Text.typeParameters(parameters);

    return [Values.line(`${head} in type `, label, list)];
  }

  if (Option.isNone(introduced) || !isSignatureDeclaration(introduced.value)) {
    return [Values.line(head)];
  }

  const declaration = introduced.value;
  const signature = yield* checker.getSignatureFromDeclaration(declaration);
  const label = yield* functionName(declaration, name);
  const written = yield* Values.signed(
    Values.line(`${head} in `, label),
    signature,
    { name, kind: SyntaxKind.CallSignature },
  );

  return [written];
});

/** A type alias, with its type parameters and the type it names. */
export const alias = Effect.fnUntraced(function* ({
  name,
  symbol,
}: Subject.Subject) {
  const checker = yield* Checker.Checker;
  const program = yield* Program.Program;
  const label = yield* Text.symbol(symbol, name);
  const declarations = yield* program.declarations(symbol);
  const parameters = yield* Text.declaredTypeParameters(declarations);
  const list = yield* Text.typeParameters(parameters);
  let type = yield* checker.getDeclaredTypeOfSymbol(symbol);
  // `as const` names no alias: the compiler shows the type the assertion gives its expression.
  if (
    isTypeReferenceNode(name.parent) &&
    name.text === "const" &&
    name.parent.typeArguments === undefined
  ) {
    type = yield* checker.getTypeAtLocation(name.parent);
  }

  const text = yield* Text.alias(type, name);

  return [Values.line("type ", label, `${list} = ${text}`)];
});
