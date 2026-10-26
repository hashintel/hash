/** Repetition, delimiters and recursion for string grammars. @internal */
import { Result, Schema, flow, pipe } from "effect";

import { ExpectedProgress, ParserError } from "./parser-error.js";
import * as Parser from "./parser.js";
import { repeatSource } from "./schema-arbitrary.js";

import type { Reason } from "./parser-error.js";

/** Keeps the preceding value after consuming a suffix. */
export const skip =
  <U, S extends Reason>(suffix: Parser.Parser<U, S>) =>
  <T, R extends Reason>(self: Parser.Parser<T, R>): Parser.Parser<T, R | S> =>
    pipe(
      self,
      Parser.and(suffix),
      Parser.map(([output]) => output),
    );

/** Discards a prefix's value and keeps the following value. */
export const preceded =
  <U, S extends Reason>(prefix: Parser.Parser<U, S>) =>
  <T, R extends Reason>(self: Parser.Parser<T, R>): Parser.Parser<T, R | S> =>
    pipe(
      prefix,
      Parser.and(self),
      Parser.map(([, output]) => output),
    );

/** Commits failures after the grammar has selected this branch. */
export const cut = <T, R extends Reason>(
  self: Parser.Parser<T, R>,
): Parser.Parser<T, R> =>
  Parser.from({
    parse: flow(
      self.parse,
      Result.mapError((failure) => failure.commit()),
    ),
    schema: self.schema,
  });

/** Reads zero or more items; an empty successful item fails instead of looping. */
export const repeat = <T, R extends Reason>(
  self: Parser.Parser<T, R>,
): Parser.Parser<readonly T[], R | ExpectedProgress> =>
  Parser.from<readonly T[], R | ExpectedProgress>({
    parse: (input) => {
      const output: T[] = [];
      let remaining = input;

      for (;;) {
        const result = self.parse(remaining);

        if (Result.isFailure(result)) {
          if (result.failure.committed) {
            return Result.fail(
              result.failure.shift(input.length - remaining.length),
            );
          }

          return Result.succeed({ input: remaining, output });
        }

        if (result.success.input.length === remaining.length) {
          return Result.fail(
            ParserError.at(
              input.length - remaining.length,
              ExpectedProgress(),
            ).commit(),
          );
        }

        output.push(result.success.output);
        remaining = result.success.input;
      }
    },
    schema: () => repeatSource(self.schema()),
  });

/** Reads a nonempty list without accepting a trailing separator. */
export const separated =
  <U, S extends Reason>(separator: Parser.Parser<U, S>) =>
  <T, R extends Reason>(
    self: Parser.Parser<T, R>,
  ): Parser.Parser<readonly [T, ...T[]], R | S | ExpectedProgress> =>
    pipe(
      self,
      Parser.and(repeat(preceded(separator)(self))),
      Parser.map(([first, rest]): readonly [T, ...T[]] => [first, ...rest]),
    );

/**
 * Defers a recursive grammar for parsing and source generation.
 *
 * Effect's sample size controls recursive generation. The grammar must have a finite branch. Parsing uses the JavaScript call stack.
 */
export const suspend = <T, R extends Reason>(
  grammar: () => Parser.Parser<T, R>,
): Parser.Parser<T, R> => {
  let resolved: Parser.Parser<T, R> | undefined = undefined;
  const get = (): Parser.Parser<T, R> => (resolved ??= grammar());

  return Parser.from({
    parse: (input) => get().parse(input),
    schema: () => Schema.suspend(() => get().schema()),
  });
};
