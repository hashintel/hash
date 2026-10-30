/**
 * Composes string parsers and generators from the same builder operations.
 *
 * Start with {@link make}, then compose builders with {@link flow} or {@link pipe}. A {@link Parser} consumes an input prefix and returns its remaining input with the accumulated output. Add {@link eof} to require complete consumption. Character counts use Unicode scalar values. {@link ParserError.offset} counts UTF-16 code units.
 *
 * Source generators propose inputs. {@link Parser.arbitrary} keeps complete parses and obtains their outputs from the parser. Those outputs are not an independent correctness oracle. Ordered choices and greedy readers can discard candidates. Restrictive grammars can exhaust Effect's discard budget.
 *
 * Callbacks must be pure because sampling and shrinking run the parser again. Callback exceptions throw during parsing. Sampling through Effect turns them into defects. These builders are internal and have no package export.
 *
 * @example <caption>Compose a Unicode identifier parser.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Result, flow } from "effect";
 * import { xidContinue, xidStart } from "./character-class.js";
 * import { charIn, eof, make, map, takeWhile } from "./parser.js";
 *
 * const identifier = flow(
 *   charIn(xidStart),
 *   takeWhile(xidContinue),
 *   map(([[, first], rest]) => first + rest),
 *   eof,
 * )(make());
 * assert.equal(Result.getOrThrow(identifier.parse("Δelta2")).output, "Δelta2");
 * assert.ok(Result.isFailure(identifier.parse("2delta")));
 * ```
 *
 * @internal
 */
import {
  Arbitrary,
  Array,
  Filter,
  HashSet,
  Option,
  Result,
  Schema,
  String,
  flow,
  pipe,
} from "effect";

import { unicodeScalar } from "./character-class.js";
import {
  ExpectedCharacterClass,
  ExpectedEndOfInput,
  ExpectedLiteral,
  ExpectedScalar,
  InsufficientLength,
  ParserError,
} from "./parser-error.js";
import { repeatSource, sourceText } from "./schema-arbitrary.js";

import type { CharacterClass } from "./character-class.js";
import type { Reason } from "./parser-error.js";

/** The remaining input and value accumulated by a successful parse. */
export interface State<T> {
  readonly input: string;
  readonly output: T;
}

/** A complete input accepted by a parser, paired with its decoded output. */
export interface Sample<T> {
  readonly source: string;
  readonly output: T;
}

/** A prefix parse whose failure retains the reason type `R`. */
export type Return<T, R extends Reason> = Result.Result<
  State<T>,
  ParserError<R>
>;

/** A reusable parser and its candidate-source schema. */
interface Definition<T, R extends Reason> {
  /** Runs immediately. Expected failures return as a failed {@link Result.Result | Result}. */
  readonly parse: (input: string) => Return<T, R>;
  /** Retains recursive structure for Effect's size-controlled source generation. */
  readonly schema: () => Schema.Codec<string>;
}

/**
 * A parser builder that preserves output and failure types through composition.
 *
 * {@link Parser.source | source} proposes candidates without checking complete consumption. {@link Parser.arbitrary | arbitrary} validates candidates and derives their outputs. A successful prefix parse can leave input even when its source candidate cannot produce a complete sample.
 */
export interface Parser<T, R extends Reason> extends Definition<T, R> {
  /** Proposes source text for the complete-consumption check in {@link Parser.arbitrary}. */
  readonly source: () => Arbitrary.Arbitrary<string>;
  /** Derives a generator whose sampling can fail with {@link Arbitrary.SampleError} after too many discarded candidates. */
  readonly arbitrary: () => Arbitrary.Arbitrary<Sample<T>>;
}

/** A builder that appends one output and adds its reasons to the preceding parser. */
export type Append<U, S extends Reason> = <T, R extends Reason>(
  self: Parser<T, R>,
) => Parser<readonly [T, U], R | S>;

/** Attaches sampling once, without reparsing at each generator node. */
export const from = <T, R extends Reason>({
  parse,
  schema,
}: Definition<T, R>): Parser<T, R> => {
  let resolved: Schema.Codec<string> | undefined = undefined;
  let source: Arbitrary.Arbitrary<string> | undefined = undefined;
  const getSchema = (): Schema.Codec<string> => (resolved ??= schema());
  const getSource = (): Arbitrary.Arbitrary<string> =>
    (source ??= Arbitrary.schema(getSchema()));

  return {
    parse,
    schema: getSchema,
    source: getSource,
    arbitrary: flow(
      getSource,
      Arbitrary.filterMap(
        Filter.fromPredicateOption((input) =>
          pipe(
            parse(input),
            Result.getSuccess,
            Option.filter((state) => String.isEmpty(state.input)),
            Option.map((state) => ({ source: input, output: state.output })),
          ),
        ),
      ),
    ),
  };
};

const surrogateStart = 0xd8_00;
const surrogateEnd = 0xe0_00;
const astralStart = 0x01_00_00;
const maximumSliceLength = 0xff_ff_ff_ff;

/** Seeds the output without consuming input or cloning the seed. Omission seeds `undefined`. */
export function make(): Parser<undefined, never>;
export function make<T>(output: T): Parser<T, never>;
export function make<T>(output?: T): Parser<T | undefined, never> {
  return from<T | undefined, never>({
    parse: (input) => Result.succeed({ input, output }),
    schema: () => Schema.Literal(""),
  });
}

/** Appends a child parser's output. It translates the child's error offsets into the parent's input. */
export const and =
  <U, S extends Reason>(suffix: Parser<U, S>): Append<U, S> =>
  <T, R extends Reason>(prefix: Parser<T, R>): Parser<readonly [T, U], R | S> =>
    from<readonly [T, U], R | S>({
      parse: (input) =>
        prefix.parse(input).pipe(
          Result.flatMap((previous) =>
            suffix.parse(previous.input).pipe(
              Result.mapBoth({
                onSuccess: (success) => ({
                  input: success.input,
                  output: [previous.output, success.output],
                }),
                onFailure: (failure) =>
                  failure.shift(input.length - previous.input.length),
              }),
            ),
          ),
        ),
      schema: () =>
        sourceText(
          Schema.Tuple([prefix.schema(), suffix.schema()]),
          ([before, after]) => before + after,
        ),
    });

/** Requires complete consumption while preserving the accumulated output. */
export const eof = <T, R extends Reason>(
  self: Parser<T, R>,
): Parser<T, R | ExpectedEndOfInput> =>
  from<T, R | ExpectedEndOfInput>({
    parse: (input) =>
      self.parse(input).pipe(
        Result.filterOrFail(
          (state) => String.isEmpty(state.input),
          (state) =>
            ParserError.at(
              input.length - state.input.length,
              ExpectedEndOfInput(),
            ),
        ),
      ),
    schema: self.schema,
  });

/** Inclusive scalar-count bounds: integers in [0, 2³² − 1], with the minimum no greater than the maximum. */
export interface SliceBounds {
  readonly minLength: number;
  readonly maxLength: number;
}

/** Failures from a bounded Unicode scalar reader. */
type ScalarReason = ExpectedScalar | InsufficientLength;

/** Consumes up to the maximum scalar count, rejecting isolated UTF-16 surrogates. */
const slice = ({
  minLength,
  maxLength,
}: SliceBounds): Parser<string, ScalarReason> => {
  if (
    !Number.isInteger(minLength) ||
    !Number.isInteger(maxLength) ||
    minLength < 0 ||
    maxLength > maximumSliceLength ||
    minLength > maxLength
  ) {
    throw new RangeError(
      "Slice bounds must be ordered unsigned 32-bit integers",
    );
  }

  const source = sourceText(
    Schema.Array(unicodeScalar.schema()).check(
      Schema.isMinLength(minLength),
      Schema.isMaxLength(maxLength),
    ),
    Array.join(""),
  );

  return from<string, ScalarReason>({
    parse: (input) => {
      let end = 0;
      let count = 0;
      while (count < maxLength) {
        const codePoint = input.codePointAt(end);
        if (codePoint === undefined) {
          break;
        }

        if (codePoint >= surrogateStart && codePoint < surrogateEnd) {
          return Result.fail(ParserError.at(end, ExpectedScalar()));
        }

        end += codePoint < astralStart ? 1 : 2;
        count += 1;
      }

      return pipe(
        count,
        Result.liftPredicate(
          (actual) => actual >= minLength,
          (actual) =>
            ParserError.at(
              end,
              InsufficientLength({ minimum: minLength, actual }),
            ),
        ),
        Result.map(() => ({
          input: input.slice(end),
          output: input.slice(0, end),
        })),
      );
    },
    schema: () => source,
  });
};

const character = slice({ minLength: 1, maxLength: 1 });

/** Appends one Unicode scalar value, including an astral value, or fails at the offending unit. */
export const nextChar: Append<string, ScalarReason> = and(character);

/**
 * Appends exactly `length` Unicode scalar values.
 *
 * Zero appends an empty string without examining the input. Short input and isolated surrogates produce a failed {@link Return}.
 *
 * @throws {RangeError} If `length` is not an integer in [0, 2³² − 1].
 */
export const nextSlice = (length: number): Append<string, ScalarReason> =>
  and(slice({ minLength: length, maxLength: length }));

/**
 * Appends up to the maximum scalar count without searching for a delimiter.
 *
 * The reader stops at the maximum or the end of input. It fails if fewer than the minimum remain. An isolated surrogate before the maximum fails with {@link ExpectedScalar}, even after the minimum. A later parser cannot make this reader return characters it has consumed.
 *
 * @throws {RangeError} If the counts violate {@link SliceBounds}.
 */
export const nextSliceBetween = (
  bounds: SliceBounds,
): Append<string, ScalarReason> => and(slice(bounds));

/** Appends one member of a character class or fails without consuming input. */
export const charIn = (
  characters: CharacterClass,
): Append<string, ExpectedCharacterClass> => {
  const failure = ParserError.at(
    0,
    ExpectedCharacterClass({
      name: characters.name,
      pattern: characters.pattern,
    }),
  );

  return and(
    from({
      parse: (input) =>
        pipe(
          String.codePointAt(input, 0),
          Result.fromOption(() => failure),
          Result.map((codePoint) =>
            input.slice(0, codePoint < astralStart ? 1 : 2),
          ),
          Result.filterOrFail(characters.test, () => failure),
          Result.map((output) => ({
            input: input.slice(output.length),
            output,
          })),
        ),
      schema: characters.schema,
    }),
  );
};

/**
 * Appends the longest prefix whose scalars belong to a character class.
 *
 * Zero matches succeed with an empty string. The first nonmember stays in the input, including an isolated surrogate. Parsing has no length limit. Effect's sample size controls generated lengths without limiting accepted inputs.
 */
export const takeWhile = (characters: CharacterClass): Append<string, never> =>
  and(
    from<string, never>({
      parse: (input) => {
        let end = 0;

        for (const character of input) {
          if (!characters.test(character)) {
            break;
          }

          end += character.length;
        }

        return Result.succeed({
          input: input.slice(end),
          output: input.slice(0, end),
        });
      },
      schema: () => repeatSource(characters.schema()),
    }),
  );

/**
 * Appends an exact string, retaining its literal type.
 *
 * Empty text consumes nothing. Unlike scalar readers, this matches exact UTF-16 text, including isolated surrogates. A failure points to the first mismatched code unit.
 */
export const literal = <const L extends string>(
  text: L,
): Append<L, ExpectedLiteral> =>
  and(
    from({
      parse: (input) => {
        if (input.startsWith(text)) {
          return Result.succeed({
            input: input.slice(text.length),
            output: text,
          });
        }

        let offset = 0;
        while (
          offset < input.length &&
          offset < text.length &&
          input[offset] === text[offset]
        ) {
          offset += 1;
        }

        return Result.fail(
          ParserError.at(offset, ExpectedLiteral({ literal: text })),
        );
      },
      schema: () => Schema.Literal(text),
    }),
  );

/**
 * Transforms the output without changing consumed text.
 *
 * The callback runs synchronously after a successful parse, not during builder construction. Its result is not awaited. Thrown exceptions propagate outside the typed failure channel. Use {@link tryMap} for expected semantic failures.
 */
export const map =
  <T, U>(transform: (output: T) => U) =>
  <R extends Reason>(self: Parser<T, R>): Parser<U, R> =>
    from({
      parse: flow(
        self.parse,
        Result.map((state) => ({
          input: state.input,
          output: transform(state.output),
        })),
      ),
      schema: self.schema,
    });

/**
 * Transforms the output or records a typed semantic reason after the consumed text.
 *
 * The callback's reason type joins the parser's existing reason types. Use a tagged value such as a `Data.TaggedClass` instance. Failure discards the candidate during generation. Thrown callback exceptions propagate unchanged.
 */
export const tryMap =
  <T, U, S extends Reason>(transform: (output: T) => Result.Result<U, S>) =>
  <R extends Reason>(self: Parser<T, R>): Parser<U, R | S> =>
    from<U, R | S>({
      parse: (input) =>
        self.parse(input).pipe(
          Result.flatMap((state) =>
            transform(state.output).pipe(
              Result.mapBoth({
                onSuccess: (output) => ({ input: state.input, output }),
                onFailure: (reason) =>
                  ParserError.at(input.length - state.input.length, reason),
              }),
            ),
          ),
        ),
      schema: self.schema,
    });

/** Restores input on a backtracking failure. Committed failures propagate. */
export const optional = <T, R extends Reason>(
  self: Parser<T, R>,
): Parser<Option.Option<T>, R> =>
  from({
    parse: (input) =>
      self.parse(input).pipe(
        Result.match({
          onSuccess: (success) =>
            Result.succeed({
              input: success.input,
              output: Option.some(success.output),
            }),
          onFailure: (failure) => {
            if (failure.committed) {
              return Result.fail(failure);
            }
            return Result.succeed({ input, output: Option.none<T>() });
          },
        }),
      ),
    schema: () => Schema.Union([Schema.Literal(""), self.schema()]),
  });

/** Retains each alternative's output and reason before forming their unions. */
type ParserTypes<P> =
  P extends Parser<infer T, infer R> ? readonly [T, R] : never;

/**
 * Tries branches in order from the same input, retaining the furthest failure reasons.
 *
 * The first successful branch wins even if it leaves input. A later {@link eof} cannot reopen that decision. Put complete-consumption checks inside the branches when that is the intended choice. The output and reason types each form a union over the branches.
 */
export function choice<
  const P extends readonly [
    // oxlint-disable-next-line typescript/no-restricted-types -- This is an output upper bound. ParserTypes preserves the actual branch type.
    Parser<unknown, Reason>,
    // oxlint-disable-next-line typescript/no-restricted-types -- The remaining branches may have different outputs. ParserTypes retains their union.
    ...Parser<unknown, Reason>[],
  ],
>(...parsers: P): Parser<ParserTypes<P[number]>[0], ParserTypes<P[number]>[1]>;
export function choice<T, R extends Reason>(
  ...parsers: readonly [Parser<T, R>, ...Parser<T, R>[]]
): Parser<T, R> {
  return from<T, R>({
    parse: (input) => {
      let failure = new ParserError({
        offset: 0,
        expected: HashSet.empty<R>(),
      });

      for (const parser of parsers) {
        const result = parser.parse(input);
        if (Result.isSuccess(result)) {
          return result;
        }

        if (result.failure.committed) {
          return result;
        }
        failure = failure.merge(result.failure);
      }

      return Result.fail(failure);
    },
    schema: () => Schema.Union(Array.map(parsers, (parser) => parser.schema())),
  });
}
