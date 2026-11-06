import {
  Array,
  Context,
  Effect,
  Layer,
  MutableHashMap,
  Option,
  flow,
} from "effect";
import * as Syntax from "typescript/ast";
import { SymbolFlags, isIntersectionType } from "typescript/async";

import * as TypeScript from "../TypeScript/index.js";
import * as Source from "./ast/source.js";

import type { Cause } from "effect";
import type { Symbol as CompilerSymbol, Type } from "typescript/async";

/** The named types an interface or a class extends or implements, as the checker reads them. */
export class Heritage extends Context.Service<Heritage, Heritage.Shape>()(
  "@local/hashql-docs/internal/ast-heritage/Heritage",
) {}

export declare namespace Heritage {
  export interface Shape {
    /**
     * The interfaces and classes `symbol` extends or implements directly, each once, or none for a symbol that is neither.
     *
     * A base the syntax cannot name is still found, such as the class a schema factory returns or an intersection of interfaces, and an external type has bases as well as a local one.
     */
    readonly bases: (
      symbol: CompilerSymbol,
    ) => Effect.Effect<readonly CompilerSymbol[], Cause.UnknownError>;
  }
}

const isNamed = (symbol: CompilerSymbol): boolean =>
  TypeScript.Symbol.hasFlag(symbol, SymbolFlags.Interface) ||
  TypeScript.Symbol.hasFlag(symbol, SymbolFlags.Class);

/** The type expressions of a class's `implements` clauses, which the checker leaves out of its base types. */
const implemented = (
  node: Syntax.Node,
): readonly Syntax.HeritageClause["types"][number][] => {
  if (!Syntax.isClassDeclaration(node)) {
    return [];
  }

  return Source.heritageOf(node, Syntax.SyntaxKind.ImplementsKeyword);
};

export const layer = Effect.gen(function* () {
  const checker = yield* TypeScript.Checker.Checker;
  const program = yield* TypeScript.Program.Program;
  const cache = MutableHashMap.empty<number, readonly CompilerSymbol[]>();

  const namedOf = (
    type: Type,
  ): Effect.Effect<readonly CompilerSymbol[], Cause.UnknownError> => {
    if (isIntersectionType(type)) {
      return checker
        .getTypesOfIntersection(type)
        .pipe(
          Effect.flatMap(Effect.forEach(namedOf)),
          Effect.map(Array.flatten),
        );
    }

    return checker
      .getSymbolOfType(type)
      .pipe(Effect.map(flow(Option.filter(isNamed), Option.toArray)));
  };

  const bases = Effect.fnUntraced(function* (symbol: CompilerSymbol) {
    const existing = MutableHashMap.get(cache, symbol.id);

    if (Option.isSome(existing)) {
      return existing.value;
    }

    if (!isNamed(symbol)) {
      return [];
    }

    const declared = yield* checker.getDeclaredTypeOfSymbol(symbol);
    const extended = yield* checker.getBaseTypes(declared);
    const declarations = yield* program.declarations(symbol);
    const interfaces = yield* Effect.forEach(
      Array.flatMap(declarations, implemented),
      checker.getTypeAtLocation,
    );
    const named = yield* Effect.forEach(
      Array.appendAll(extended, interfaces),
      namedOf,
    );
    const direct = Array.dedupeWith(
      Array.flatten(named),
      (left, right) => left.id === right.id,
    );
    MutableHashMap.set(cache, symbol.id, direct);

    return direct;
  });

  return Heritage.of({ bases });
}).pipe(Layer.effect(Heritage));

/** The interfaces and classes `symbol` extends or implements directly. */
export const bases = (
  symbol: CompilerSymbol,
): Effect.Effect<readonly CompilerSymbol[], Cause.UnknownError, Heritage> =>
  Effect.flatMap(Heritage, (heritage) => heritage.bases(symbol));
