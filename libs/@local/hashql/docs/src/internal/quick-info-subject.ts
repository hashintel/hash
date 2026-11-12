import { Array, Effect, Function, Option, Predicate } from "effect";
import { SyntaxKind, isObjectLiteralExpression } from "typescript/ast";
import { SymbolFlags } from "typescript/async";

import * as Checker from "../TypeScript/Checker.js";
import * as Symbol from "../TypeScript/Symbol.js";
import * as Location from "./quick-info-location.js";

import type { Identifier } from "typescript/ast";
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

/** The property `name` of the types `members` when they have exactly one between them, and none otherwise. */
const shared = Effect.fnUntraced(function* (
  members: readonly Type[],
  name: string,
) {
  const checker = yield* Checker.Checker;
  const properties = yield* Effect.forEach(members, (member) =>
    checker.getPropertyOfType(member, name),
  );
  const distinct = Array.dedupeWith(
    Array.getSomes(properties),
    (self, that) => self.id === that.id,
  );
  if (distinct.length !== 1) {
    return Option.none<CompilerSymbol>();
  }

  return Array.head(distinct);
});

/**
 * The property that `name` gives a value for, where `name` names a member of an object literal and the code around the literal expects a type with one such property.
 *
 * An editor shows that property, with the type it declares, rather than the member the literal itself declares. Where the expected type is a union, the property is that of the members the literal fits, and of any member when those have none.
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

  const checker = yield* Checker.Checker;
  const type = yield* checker.getContextualType(parent.parent);
  if (Option.isNone(type)) {
    return Option.none<CompilerSymbol>();
  }

  if (!type.value.isUnionType()) {
    return yield* checker.getPropertyOfType(type.value, name.text);
  }

  const members = yield* checker.getTypesOfUnion(type.value);
  const written = yield* checker.getTypeAtLocation(parent.parent);
  const fits = yield* Effect.filter(members, (member) =>
    checker.isTypeAssignableTo(written, member),
  );
  const fitted = yield* shared(fits, name.text);
  if (Option.isSome(fitted)) {
    return fitted;
  }

  return yield* shared(members, name.text);
});

/** What `name` names where it stands, given the symbol `found` that the compiler resolves it to, or none for a name the program cannot resolve. */
export const of = Effect.fnUntraced(function* (
  name: Identifier,
  found: CompilerSymbol,
) {
  const checker = yield* Checker.Checker;
  const property = yield* expected(name);
  const resolved = Option.getOrElse(property, () => found);
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
