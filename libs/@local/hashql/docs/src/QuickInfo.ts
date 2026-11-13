import { Array, Effect, Function, Option, Predicate, String } from "effect";
import { SymbolFlags } from "typescript/async";

import * as Print from "./internal/quick-info-print.js";
import * as Subject from "./internal/quick-info-subject.js";
import * as Types from "./internal/quick-info-types.js";
import * as Values from "./internal/quick-info-values.js";

import type * as Api from "./TypeScript/Api.js";
import type * as Checker from "./TypeScript/Checker.js";
import type * as Program from "./TypeScript/Program.js";
import type { Cause } from "effect";
import type { Identifier, TypeNode } from "typescript/ast";
import type { Symbol as CompilerSymbol } from "typescript/async";

/**
 * One line of quick info, as the parts it reads in and the signature it ends with.
 *
 * The compiler writes a keyword, a name and the type after a name as text. It has no call that writes a type inside a name, as `Box<number>` in `Box<number>.value`, or a signature, so those stay the syntax it builds until `display` prints them. A constraint among a holder's type parameters, as `Space.Kind` in `Box<T extends Space.Kind>.value`, is the syntax its declaration writes.
 */
export interface Line {
  readonly parts: readonly (string | TypeNode)[];
  readonly signature: Option.Option<Checker.SignatureNode>;
}

/**
 * What an editor shows on hover over a name in code.
 *
 * A name has a line for each meaning it has where it stands, as a value, a type or a namespace, and a function has a line for each overload.
 *
 * The text follows the hover of the compiler's language server, and differs from it in four places on purpose:
 *
 * - An imported name has no mark before its lines.
 * - A type after a name and a signature are written in full, where an editor cuts a long one short.
 * - A module that no import names reads as a namespace under the name the code uses. The compiler names it by its file's path, which belongs to the machine that built the documentation.
 * - A name the compiler resolves to no symbol has no quick info, where an editor shows the type at the name. The label of a tuple member is such a name.
 */
export type QuickInfo = Array.NonEmptyReadonlyArray<Line>;

/** The lines quick info has for a symbol, each for the flags that select it, in the order an editor shows them. */
const forms = [
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  [SymbolFlags.Variable | SymbolFlags.PropertyOrAccessor, Values.value],
  [SymbolFlags.EnumMember, Values.enumMember],
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  [SymbolFlags.Function | SymbolFlags.Method, Values.callable],
  // oxlint-disable-next-line no-bitwise -- `SymbolFlags` is the compiler's bit set.
  [SymbolFlags.Class | SymbolFlags.Interface, Types.declared],
  [SymbolFlags.Enum, Types.enumeration],
  [SymbolFlags.Module, Types.namespace],
  [SymbolFlags.TypeParameter, Types.typeParameter],
  [SymbolFlags.TypeAlias, Types.alias],
] as const;

/**
 * The quick info of `name`, which the compiler resolves to `found`, or none for a name that has none, such as one the program cannot resolve.
 *
 * An imported name shows what it imports.
 */
export const of: {
  (
    found: CompilerSymbol,
  ): (
    name: Identifier,
  ) => Effect.Effect<
    Option.Option<QuickInfo>,
    Cause.UnknownError,
    Checker.Checker | Program.Program
  >;
  (
    name: Identifier,
    found: CompilerSymbol,
  ): Effect.Effect<
    Option.Option<QuickInfo>,
    Cause.UnknownError,
    Checker.Checker | Program.Program
  >;
} = Function.dual(
  2,
  Effect.fnUntraced(function* (name: Identifier, found: CompilerSymbol) {
    const subject = yield* Subject.of(name, found);
    if (Option.isNone(subject)) {
      return Option.none<QuickInfo>();
    }

    const lines = yield* Effect.forEach(
      Array.filter(forms, ([flags]) => Subject.shows(subject.value, flags)),
      ([, describe]) => describe(subject.value),
    );

    return Option.liftPredicate(
      Array.flatten(lines),
      Array.isReadonlyArrayNonEmpty,
    );
  }),
);

/** One part of a line as text. A type inside a name stands on one line, as the compiler writes a name. */
const written = (
  part: Line["parts"][number],
): Effect.Effect<string, Cause.UnknownError, Api.Api> => {
  if (Predicate.isString(part)) {
    return Effect.succeed(part);
  }

  return Effect.map(Print.print(part), String.replaceAll(/\s*\n\s*/gu, " "));
};

/** Quick info as an editor shows it, such as `const query: ExpressionType`. */
export const display = Effect.fnUntraced(function* (
  info: QuickInfo,
): Effect.fn.Return<string, Cause.UnknownError, Api.Api> {
  const lines = yield* Effect.forEach(
    info,
    Effect.fnUntraced(function* ({ parts, signature }) {
      const head = yield* Effect.forEach(parts, written);
      const tail = yield* Effect.transposeOption(
        Option.map(signature, Print.print),
      );

      return Option.match(tail, {
        onNone: () => head.join(""),
        // The printer ends a call signature with the `;` that separates it from the next member of a type literal.
        onSome: (printed) =>
          `${head.join("")}${String.replace(/;$/u, "")(printed.trimEnd())}`,
      });
    }),
  );

  return lines.join("\n");
});
