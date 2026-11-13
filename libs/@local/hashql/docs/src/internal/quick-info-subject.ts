import {
  Array,
  Boolean,
  Effect,
  Function,
  Option,
  Predicate,
  pipe,
} from "effect";
import {
  SyntaxKind,
  isComputedPropertyName,
  isMetaProperty,
  isObjectLiteralExpression,
  isSpreadAssignment,
} from "typescript/ast";
import { SymbolFlags, TypeFlags } from "typescript/async";

import * as Checker from "../TypeScript/Checker.js";
import * as Symbol from "../TypeScript/Symbol.js";
import * as Location from "./quick-info-location.js";

import type { Cause } from "effect";
import type {
  Identifier,
  ObjectLiteralElementLike,
  ObjectLiteralExpression,
} from "typescript/ast";
import type { Symbol as CompilerSymbol, Type } from "typescript/async";

/** What a name names, where it stands. */
export interface Subject {
  readonly name: Identifier;
  /** The symbol the name resolves to, after any import. */
  readonly symbol: CompilerSymbol;
  /** The symbol at the name itself, which is the import for an imported name. */
  readonly resolved: CompilerSymbol;
  /** The flags of the symbol that the position of the name selects. */
  readonly flags: SymbolFlags;
}

/** Whether `flags` has any of `flag`. */
const has = (flags: SymbolFlags, flag: SymbolFlags): boolean =>
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  (flags & flag) !== 0;

/** Whether the position of the name selects any of `flags` of its symbol. */
export const shows: {
  (flags: SymbolFlags): (self: Subject) => boolean;
  (self: Subject, flags: SymbolFlags): boolean;
} = Function.dual(2, (self: Subject, flags: SymbolFlags): boolean =>
  has(self.flags, flags),
);

/** The flags of a symbol that quick info has a line for. */
const shown =
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  SymbolFlags.Value | SymbolFlags.Type | SymbolFlags.Namespace;

/** The flags of a symbol that each meaning of a name selects. */
const selected = {
  value: SymbolFlags.Value,
  type: SymbolFlags.Type,
  namespace: SymbolFlags.Namespace,
  any: shown,
} as const satisfies Record<Location.Meaning, SymbolFlags>;

/**
 * The flags of `symbol` that have a line where a name means `meaning`.
 *
 * Where the symbol has none of the meaning's flags, a name that reaches it directly shows every meaning it has, and a name that imports it has no quick info. A property that a method declares, as a mapped type makes of one, reads as the method.
 */
const flagsOf = (
  { symbol, resolved }: Pick<Subject, "symbol" | "resolved">,
  meaning: Location.Meaning,
): SymbolFlags => {
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  const flags = symbol.flags & selected[meaning];
  if (flags === 0 && symbol === resolved) {
    // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
    return symbol.flags & shown;
  }

  const method =
    has(flags, SymbolFlags.Property) &&
    symbol.valueDeclaration?.kind === SyntaxKind.MethodDeclaration;

  return method ? SymbolFlags.Method : flags;
};

/** Whether `type` is a unit type, which has one value: a literal, an enum member, a unique symbol, `null` or `undefined`. */
const isUnit = (type: Type): boolean =>
  // oxlint-disable-next-line no-bitwise -- `TypeFlags` is the compiler's bit set.
  (type.flags & TypeFlags.Unit) !== 0;

/** Whether a property of `type` can tell the members of a union apart: `boolean`, an enum, a unit type, or a union of unit types. */
const discriminates = Effect.fnUntraced(function* (type: Type) {
  // oxlint-disable-next-line no-bitwise -- `TypeFlags` is the compiler's bit set.
  if ((type.flags & (TypeFlags.Boolean | TypeFlags.EnumLiteral)) !== 0) {
    return true;
  }
  if (!type.isUnionType()) {
    return isUnit(type);
  }

  const checker = yield* Checker.Checker;
  const members = yield* checker.getTypesOfUnion(type);

  return Array.every(members, isUnit);
});

/** The name a member of an object literal declares, or none for a spread and for a computed name that is no string or number literal. */
const declared = Effect.fnUntraced(function* (
  member: ObjectLiteralElementLike,
) {
  if (isSpreadAssignment(member)) {
    return Option.none<string>();
  }

  const { name } = member;
  if (!isComputedPropertyName(name)) {
    return Option.some(name.text);
  }

  const checker = yield* Checker.Checker;
  const key = yield* checker.getTypeAtLocation(name.expression);
  if (!key.isLiteralType() || Predicate.isObject(key.value)) {
    return Option.none<string>();
  }

  return Option.some(String(key.value));
});

/** Whether `member` of an object literal has a value that `type` rules out, where `type` declares the property with a type that tells the members of a union apart. */
const conflicts = Effect.fnUntraced(function* (
  type: Type,
  member: ObjectLiteralElementLike,
) {
  const checker = yield* Checker.Checker;
  const name = yield* declared(member);
  const property = yield* Effect.transposeOption(
    Option.map(name, (text) => checker.getPropertyOfType(type, text)),
  );
  const found = Option.flatten(property);
  if (Option.isNone(found)) {
    return false;
  }

  const wanted = yield* checker.getTypeOfSymbol(found.value);
  const telling = yield* discriminates(wanted);
  if (!telling) {
    return false;
  }

  const written = yield* checker.getTypeAtLocation(member);
  const fits = yield* checker.isTypeAssignableTo(written, wanted);

  return !fits;
});

/** Whether `literal` gives a property a value that `type` rules out. */
const excludes = (
  type: Type,
  literal: ObjectLiteralExpression,
): Effect.Effect<boolean, Cause.UnknownError, Checker.Checker> =>
  Effect.map(
    Effect.findFirst(literal.properties, (member) => conflicts(type, member)),
    Option.isSome,
  );

/** The properties `name` of the types `members`, each once. */
const properties = Effect.fnUntraced(function* (
  members: readonly Type[],
  name: string,
) {
  const checker = yield* Checker.Checker;
  const found = yield* Effect.forEach(members, (member) =>
    checker.getPropertyOfType(member, name),
  );

  return Array.dedupeWith(
    Array.getSomes(found),
    (self, that) => self.id === that.id,
  );
});

/**
 * The property that `name` gives a value for, where `name` names a member of an object literal and the code around the literal expects a type with one such property.
 *
 * An editor shows that property, with the type it declares, rather than the member the literal itself declares. Where the expected type is a union, a member of the union is out when the literal gives one of its discriminating properties another value, and the property is the one the remaining members declare. Where they declare more than one, the name shows the literal's own member.
 */
const expected = Effect.fnUntraced(function* (name: Identifier) {
  const { parent } = name;
  if (
    !Predicate.hasProperty(parent, "name") ||
    parent.name !== name ||
    !isObjectLiteralExpression(parent.parent)
  ) {
    return Option.none<CompilerSymbol>();
  }

  const literal = parent.parent;
  const checker = yield* Checker.Checker;
  const type = yield* checker.getContextualType(literal);
  if (Option.isNone(type)) {
    return Option.none<CompilerSymbol>();
  }

  if (!type.value.isUnionType()) {
    return yield* checker.getPropertyOfType(type.value, name.text);
  }

  const members = yield* checker.getTypesOfUnion(type.value);
  const remaining = yield* Effect.filter(members, (member) =>
    Effect.map(excludes(member, literal), Boolean.not),
  );
  let candidates = yield* properties(remaining, name.text);
  // A literal that every member rules out has a wrong discriminant, and the name then reads against the whole union.
  if (remaining.length === 0) {
    candidates = yield* properties(members, name.text);
  }
  if (candidates.length !== 1) {
    return Option.none<CompilerSymbol>();
  }

  return Array.head(candidates);
});

/** The symbol of the type of `import.meta`, where `name` is its `meta`. An editor reads that name as the whole expression. */
const metaOf = Effect.fnUntraced(function* (name: Identifier) {
  const { parent } = name;
  if (
    !isMetaProperty(parent) ||
    parent.keywordToken !== SyntaxKind.ImportKeyword
  ) {
    return Option.none<CompilerSymbol>();
  }

  const checker = yield* Checker.Checker;
  const [whole] = yield* checker.getSymbolAtLocation([parent]);

  return Option.flatten(Option.fromUndefinedOr(whole));
});

/** What `name` names where it stands, given the symbol `found` that the compiler resolves it to, or none for a name the program cannot resolve. */
export const of = Effect.fnUntraced(function* (
  name: Identifier,
  found: CompilerSymbol,
) {
  const checker = yield* Checker.Checker;
  const property = yield* expected(name);
  const whole = yield* metaOf(name);
  const resolved = pipe(
    property,
    Option.orElse(() => whole),
    Option.getOrElse(() => found),
  );
  let symbol = resolved;
  if (Symbol.hasFlag(resolved, SymbolFlags.Alias)) {
    symbol = yield* checker.getAliasedSymbol(resolved);
  }

  const unknown = yield* checker.isUnknownSymbol(symbol);
  if (unknown) {
    return Option.none<Subject>();
  }

  const flags = flagsOf({ symbol, resolved }, Location.meaningOf(name));

  return Option.some<Subject>({ name, symbol, resolved, flags });
});
