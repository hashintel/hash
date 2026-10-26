/**
 * Typed reasons for parser failures at a shared input position.
 *
 * {@link SyntaxReason} describes failed syntax expectations. A semantic mapper can return its own tagged reason. The parser retains that type in its failure channel. {@link ParserError} combines reasons only when their offsets agree.
 *
 * @internal
 */
import { Data, HashSet } from "effect";

/**
 * A tagged failure value that callers can distinguish without reading prose.
 *
 * Keep reasons immutable after insertion into a set. Built-in constructors provide readonly fields, not runtime freezing.
 */
export interface Reason {
  readonly _tag: string;
}

/** Syntax expectations reported by the built-in parsers. */
export type SyntaxReason =
  | { readonly _tag: "ExpectedEndOfInput" }
  | { readonly _tag: "ExpectedProgress" }
  | { readonly _tag: "ExpectedScalar" }
  | {
      readonly _tag: "InsufficientLength";
      readonly minimum: number;
      readonly actual: number;
    }
  | { readonly _tag: "ExpectedLiteral"; readonly literal: string }
  | {
      readonly _tag: "ExpectedCharacterClass";
      readonly name: string;
      readonly pattern: string;
    };

const constructors = Data.taggedEnum<SyntaxReason>();

/** A repeated parser succeeded without consuming input. */
export type ExpectedProgress = Data.TaggedEnum.Value<
  SyntaxReason,
  "ExpectedProgress"
>;
/** Constructs the failure that prevents an empty parser from repeating forever. */
export const ExpectedProgress: Data.TaggedEnum.Constructor<SyntaxReason>["ExpectedProgress"] =
  constructors.ExpectedProgress;

/** Input remains where the grammar requires its end. */
export type ExpectedEndOfInput = Data.TaggedEnum.Value<
  SyntaxReason,
  "ExpectedEndOfInput"
>;

/** Constructs an end-of-input reason with value equality. */
export const ExpectedEndOfInput: Data.TaggedEnum.Constructor<SyntaxReason>["ExpectedEndOfInput"] =
  constructors.ExpectedEndOfInput;

/** The next input is not a Unicode scalar value. */
export type ExpectedScalar = Data.TaggedEnum.Value<
  SyntaxReason,
  "ExpectedScalar"
>;

/** Constructs a scalar expectation with value equality. */
export const ExpectedScalar: Data.TaggedEnum.Constructor<SyntaxReason>["ExpectedScalar"] =
  constructors.ExpectedScalar;

/** Input contains fewer scalars than the required minimum. */
export type InsufficientLength = Data.TaggedEnum.Value<
  SyntaxReason,
  "InsufficientLength"
>;
/** Constructs a reason whose equality includes both scalar counts. */
export const InsufficientLength: Data.TaggedEnum.Constructor<SyntaxReason>["InsufficientLength"] =
  constructors.InsufficientLength;

/** The input does not match an exact source spelling. */
export type ExpectedLiteral = Data.TaggedEnum.Value<
  SyntaxReason,
  "ExpectedLiteral"
>;

/** Constructs a reason whose equality includes the literal text. */
export const ExpectedLiteral: Data.TaggedEnum.Constructor<SyntaxReason>["ExpectedLiteral"] =
  constructors.ExpectedLiteral;

/** The next scalar is absent or outside a named character class. */
export type ExpectedCharacterClass = Data.TaggedEnum.Value<
  SyntaxReason,
  "ExpectedCharacterClass"
>;

/** Constructs a reason whose equality includes the name and pattern. */
export const ExpectedCharacterClass: Data.TaggedEnum.Constructor<SyntaxReason>["ExpectedCharacterClass"] =
  constructors.ExpectedCharacterClass;

/**
 * Failure reasons at a UTF-16 offset from the beginning of the supplied input.
 *
 * The expected set follows Effect's HashSet equality. Equal data reasons deduplicate, while different payloads remain distinct. {@link ParserError.merge | merge} selects the furthest offset before combining sets.
 *
 * @example <caption>Inspect a typed syntax failure.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { HashSet, Result, pipe } from "effect";
 * import { ExpectedLiteral } from "./parser-error.js";
 * import { eof, literal, make } from "./parser.js";
 *
 * const separator = pipe(make(), literal("::"), eof);
 * assert.ok(Result.isSuccess(separator.parse("::")));
 * const outcome = Result.match(separator.parse(":x"), {
 *   onSuccess: () => "accepted",
 *   onFailure: ({ offset, expected }) => {
 *     assert.equal(offset, 1);
 *     assert.ok(HashSet.has(expected, ExpectedLiteral({ literal: "::" })));
 *     return "rejected";
 *   },
 * });
 * assert.equal(outcome, "rejected");
 * ```
 */
export class ParserError<R extends Reason> extends Data.Class<{
  readonly offset: number;
  readonly expected: HashSet.HashSet<R>;
  readonly committed: boolean;
}> {
  constructor({
    offset,
    expected,
    committed = false,
  }: {
    readonly offset: number;
    readonly expected: HashSet.HashSet<R>;
    readonly committed?: boolean;
  }) {
    super({ offset, expected, committed });
  }

  /** Prevents alternatives and optional readers from swallowing this failure. */
  commit(): ParserError<R> {
    return new ParserError({
      offset: this.offset,
      expected: this.expected,
      committed: true,
    });
  }

  /** Records one reason without converting its payload to a message. */
  static at<R extends Reason>(offset: number, reason: R): ParserError<R> {
    return new ParserError({ offset, expected: HashSet.make(reason) });
  }

  /** Translates a child parser's offset into its parent's input coordinates. */
  shift(prefixLength: number): ParserError<R> {
    return new ParserError({
      offset: this.offset + prefixLength,
      expected: this.expected,
      committed: this.committed,
    });
  }

  /** Keeps the furthest failure, merging equal-position reasons by value. */
  // oxlint-disable-next-line typescript/prefer-return-this-type -- The other branch can carry S. Polymorphic this would incorrectly claim that it retains this instance's reason type and subclass.
  merge<S extends Reason>(other: ParserError<S>): ParserError<R | S> {
    if (other.offset > this.offset) {
      return other;
    }
    if (other.offset < this.offset) {
      return this;
    }
    return new ParserError({
      offset: this.offset,
      expected: HashSet.union(this.expected, other.expected),
      committed: this.committed || other.committed,
    });
  }
}
