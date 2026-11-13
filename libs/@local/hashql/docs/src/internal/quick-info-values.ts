import { Array, Effect, HashMap, Option, Predicate } from "effect";
import {
  SyntaxKind,
  isFunctionLikeDeclaration,
  isMethodSignatureDeclaration,
  isNewExpression,
} from "typescript/ast";
import {
  CheckFlags,
  NodeBuilderFlags,
  SignatureKind,
  SymbolFlags,
} from "typescript/async";

import * as Checker from "../TypeScript/Checker.js";
import * as Program from "../TypeScript/Program.js";
import * as Symbol from "../TypeScript/Symbol.js";
import * as Location from "./quick-info-location.js";
import * as Subject from "./quick-info-subject.js";
import * as Text from "./quick-info-text.js";

import type { Line } from "../QuickInfo.js";
import type { Identifier } from "typescript/ast";
import type {
  Symbol as CompilerSymbol,
  Signature,
  Type,
} from "typescript/async";

/** A line of `parts` that ends in no signature. Each argument is one part or a list of them. */
export const line = (...parts: readonly (Line["parts"] | string)[]): Line => ({
  parts: Array.flatMap(parts, (part) => {
    if (Predicate.isString(part)) {
      return [part];
    }

    return part;
  }),
  signature: Option.none(),
});

/** Quick info writes a signature in full, with a line for each member of an object type and the type arguments a call resolves to. An alias keeps its name even where the code does not declare it. */
const signatureFlags =
  // oxlint-disable-next-line no-bitwise -- `NodeBuilderFlags` is the compiler's bit set.
  NodeBuilderFlags.UseAliasDefinedOutsideCurrentScope |
  NodeBuilderFlags.UseInstantiationExpressions |
  NodeBuilderFlags.MultilineObjectLiterals |
  NodeBuilderFlags.WriteTypeArgumentsOfSignature |
  NodeBuilderFlags.WriteTypeParametersInQualifiedName |
  NodeBuilderFlags.NoTruncation |
  NodeBuilderFlags.IgnoreErrors;

/** `head`, then `signature` as the syntax of `kind` that the compiler builds where `name` stands. */
export const signed = Effect.fnUntraced(function* (
  head: Line,
  signature: Signature,
  { name, kind }: { name: Identifier; kind: Checker.SignatureNode["kind"] },
) {
  const checker = yield* Checker.Checker;
  const syntax = yield* checker.signatureToDeclaration(
    signature,
    Location.containerOf(name),
    { kind, flags: signatureFlags },
  );

  return { parts: head.parts, signature: syntax } satisfies Line;
});

/** The keyword quick info shows before a variable, a property or an accessor. A variable whose declaration the program does not hold is a `var`, as the standard library declares its globals. */
const keywordOf = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
  if (Symbol.hasFlag(symbol, SymbolFlags.Property)) {
    return "(property) ";
  }

  if (Symbol.hasFlag(symbol, SymbolFlags.Accessor)) {
    return "(accessor) ";
  }

  if (symbol.valueDeclaration === undefined) {
    return "";
  }

  const declaration = yield* Program.resolve(symbol.valueDeclaration);

  return Option.match(declaration, {
    onNone: () => "var ",
    onSome: Location.bindingOf,
  });
});

/** A variable, a property or an accessor, with the type it has where the name mentions it. A call shows the signature it resolves to in place of the type. */
export const value = Effect.fnUntraced(function* ({
  name,
  symbol,
}: Subject.Subject) {
  const checker = yield* Checker.Checker;
  const keyword = yield* keywordOf(symbol);
  const label = yield* Text.symbol(symbol, name);
  const optional = Symbol.hasFlag(symbol, SymbolFlags.Optional) ? "?" : "";
  const head = line(keyword, label, `${optional}: `);
  const call = Location.callOf(name);

  if (Option.isSome(call)) {
    const signature = yield* checker.getResolvedSignature(call.value);
    const constructed = isNewExpression(call.value) && signature.isConstruct;
    const written = yield* signed(head, signature, {
      name,
      kind: constructed ? SyntaxKind.ConstructorType : SyntaxKind.FunctionType,
    });

    return [written];
  }

  const type = yield* checker.getTypeOfSymbolAtLocation(symbol, name);
  const text = yield* Text.type(type, name);

  // A member that only an index signature gives has no name of its own.
  if (Symbol.hasCheckFlag(symbol, CheckFlags.IndexSymbol)) {
    return [line(text)];
  }

  return [line(head.parts, text)];
});

/** The characters the compiler escapes with a letter in a string between double quotes. */
const escapes = HashMap.make(
  ["\t", String.raw`\t`],
  ["\v", String.raw`\v`],
  ["\f", String.raw`\f`],
  ["\b", String.raw`\b`],
  ["\r", String.raw`\r`],
  ["\n", String.raw`\n`],
  ["\\", String.raw`\\`],
  ['"', String.raw`\"`],
);

/** The escape the compiler writes for a character it has no letter for, such as `\u001B`: four hexadecimal digits in capitals. */
const unicodeEscape = (character: string): string => {
  const radix = 16;
  const digits = 4;
  const code = character.codePointAt(0) ?? 0;

  return `\\u${code.toString(radix).toUpperCase().padStart(digits, "0")}`;
};

/** `text` between double quotes as the compiler writes a string literal: a quote, a backslash, a control character and a line separator are escaped, and every other character stands as it is. */
const quoted = (text: string): string => {
  const written = text.replaceAll(
    // oxlint-disable-next-line no-control-regex -- The compiler escapes the control characters.
    /[\\"\u0000-\u001F\u0085\u2028\u2029]/gu,
    (character, offset: number) => {
      if (character === "\0") {
        // A digit after `\0` would read as part of an octal escape.
        return /^\d/u.test(text.slice(offset + 1))
          ? String.raw`\x00`
          : String.raw`\0`;
      }

      return HashMap.get(escapes, character).pipe(
        Option.getOrElse(() => unicodeEscape(character)),
      );
    },
  );

  return `"${written}"`;
};

/** The value an enum member is a constant for, as quick info writes it after the member, or nothing for a member the compiler computes no value for. */
const constantOf = (type: Type): string => {
  if (!type.isLiteralType()) {
    return "";
  }

  if (Predicate.isString(type.value)) {
    return ` = ${quoted(type.value)}`;
  }

  return ` = ${String(type.value)}`;
};

/** An enum member, with the value it is a constant for. */
export const enumMember = Effect.fnUntraced(function* ({
  name,
  symbol,
}: Subject.Subject) {
  const checker = yield* Checker.Checker;
  const type = yield* checker.getTypeOfSymbol(symbol);
  const text = yield* Text.type(type, name);

  return [line(`(enum member) ${text}${constantOf(type)}`)];
});

/**
 * The signatures of `kind` that the type of `symbol` has where `name` stands.
 *
 * A call selects one overload and fixes the type arguments, so the callee of a call to an overloaded or a generic function has the signature the call resolves to.
 */
export const signaturesAt = Effect.fnUntraced(function* (
  { name, symbol }: Subject.Subject,
  kind: SignatureKind,
) {
  const checker = yield* Checker.Checker;
  const type = yield* checker.getTypeOfSymbol(symbol);
  const present = yield* checker.getNonNullableType(type);
  const signatures = yield* checker.getSignaturesOfType(present, kind);
  const call = Location.callOf(name);
  const [first] = signatures;
  const generic = (first?.typeParameters?.length ?? 0) > 0;

  if (Option.isSome(call) && (signatures.length > 1 || generic)) {
    const resolved = yield* checker.getResolvedSignature(call.value);

    return [resolved];
  }

  return signatures;
});

/** The fewest signatures of which quick info leaves some out. */
const crowded = 5;

/** How many of a crowd of signatures quick info lists before it counts the rest. */
const listed = 3;

/** A line for each of `signatures` after `head`. Of a crowd, the first few have a line, and a comment counts the rest. */
export const overloads = Effect.fnUntraced(function* (
  head: Line,
  signatures: readonly Signature[],
  name: Identifier,
) {
  let written = signatures;
  if (signatures.length >= crowded) {
    written = Array.take(signatures, listed);
  }

  const lines = yield* Effect.forEach(written, (signature) =>
    signed(head, signature, { name, kind: SyntaxKind.CallSignature }),
  );
  if (written.length === signatures.length) {
    return lines;
  }

  return Array.append(
    lines,
    line(`// +${signatures.length - written.length} more overloads`),
  );
});

/** A function or a method, with the signature it declares where the name declares it, and its signatures where the name mentions it. */
export const callable = Effect.fnUntraced(function* (subject: Subject.Subject) {
  const { name, symbol } = subject;
  const checker = yield* Checker.Checker;
  const method = Subject.shows(subject, SymbolFlags.Method);
  const label = yield* Text.symbol(symbol, name);
  const optional = Symbol.hasFlag(symbol, SymbolFlags.Optional) ? "?" : "";
  const head = line(method ? "(method) " : "function ", label, optional);
  const { parent } = name;

  if (
    (isFunctionLikeDeclaration(parent) ||
      isMethodSignatureDeclaration(parent)) &&
    Predicate.hasProperty(parent, "name") &&
    parent.name === name
  ) {
    const signature = yield* checker.getSignatureFromDeclaration(parent);

    return yield* overloads(head, [signature], name);
  }

  const signatures = yield* signaturesAt(subject, SignatureKind.Call);

  return yield* overloads(head, signatures, name);
});
