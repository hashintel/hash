/**
 * Single HashQL identifiers and their source spelling.
 *
 * An {@link Ident} stores its kind and its value without backticks, like `Ident` in `hashql-core`. Use {@link decodeResult} to read source syntax such as `foo`, `+`, `` `+` `` or `` `https://example.com/` ``, and {@link compile} to write it back. Paths, field access and the `_` placeholder are wider string expressions rather than identifiers.
 *
 * @module
 */
import {
  Schema as $Schema,
  Effect,
  Result,
  SchemaGetter,
  SchemaIssue,
  SchemaParser,
  flow,
} from "effect";

import { xidContinue, xidStart } from "../internal/character-class.js";
import * as Grammar from "../internal/ident-parser.js";
import * as Parser from "../internal/parser.js";
import { characterClass, exactly } from "../internal/schema-arbitrary.js";

import type * as ParserError from "./ParserError.js";
import type { Arbitrary, Option } from "effect";
import type { ParseOptions } from "effect/SchemaAST";

const lexicalStart = new RegExp(xidStart.pattern, "u");
const lexicalContinue = new RegExp(xidContinue.pattern, "u");
const symbolCharacter = new RegExp(Grammar.symbolCharacter.pattern, "u");
const lexicalPattern = `(?:${xidStart.pattern}${xidContinue.pattern}*|_${xidContinue.pattern}+)`;
const symbolPattern = `(?:${Grammar.symbolCharacter.pattern})+`;

const LexicalSchema: $Schema.TaggedStruct<
  "Lexical",
  { value: $Schema.String }
> = $Schema.TaggedStruct("Lexical", {
  value: exactly(lexicalPattern, () =>
    lexicalPattern
      .replaceAll(xidStart.pattern, characterClass(lexicalStart))
      .replaceAll(xidContinue.pattern, characterClass(lexicalContinue)),
  ),
});

const SymbolSchema: $Schema.TaggedStruct<"Symbol", { value: $Schema.String }> =
  $Schema.TaggedStruct("Symbol", {
    value: exactly(symbolPattern, () =>
      symbolPattern.replace(
        Grammar.symbolCharacter.pattern,
        characterClass(symbolCharacter),
      ),
    ),
  });

const BaseUrlSchema: $Schema.TaggedStruct<
  "BaseUrl",
  { value: $Schema.String }
> = $Schema.TaggedStruct("BaseUrl", {
  value: exactly(
    `(?:${Grammar.urlCharacter.pattern})+`,
    () => String.raw`https?://[a-z]+\.[a-z]+/`,
  ).check(
    $Schema.makeFilter(
      flow(Parser.eof(Grammar.baseUrlValue).parse, Result.isSuccess),
      { expected: "an HTTP(S) URL ending in /" },
    ),
  ),
});

/**
 * Schema for identifier objects with unquoted values.
 *
 * `Arbitrary.schema(SchemaFromSelf)` generates every identifier kind. Derivation computes and caches character ranges from the runtime's Unicode tables on first use.
 */
export const SchemaFromSelf: $Schema.toTaggedUnion<
  "_tag",
  readonly [typeof LexicalSchema, typeof SymbolSchema, typeof BaseUrlSchema]
> = $Schema
  .Union([LexicalSchema, SymbolSchema, BaseUrlSchema])
  .pipe($Schema.toTaggedUnion("_tag"));

/**
 * Codec between source syntax and an identifier object.
 *
 * Decoding accepts exactly one identifier. Encoding quotes symbol and base-URL identifiers. {@link make} validates the decoded object rather than source text. Arbitrary generation uses the decoded {@link SchemaFromSelf}.
 */
export const Schema: $Schema.decodeTo<
  typeof SchemaFromSelf,
  typeof $Schema.NonEmptyString
> = $Schema.NonEmptyString.pipe(
  $Schema.decodeTo(SchemaFromSelf, {
    decode: SchemaGetter.transformEffect(
      flow(
        Grammar.parseIdent,
        Result.mapError(
          (parserError) =>
            new SchemaIssue.InvalidValue({
              message: `Invalid identifier at UTF-16 offset ${parserError.offset}`,
              parserError,
            }),
        ),
        Effect.fromResult,
      ),
    ),
    // oxlint-disable-next-line no-use-before-define -- lazy evaluation that is otherwise circular
    encode: SchemaGetter.transform((value) => compile(value)),
  }),
);

/**
 * The decoded form of an identifier, with its kind in `_tag` and its value without backticks.
 *
 * A `Lexical` value follows Unicode XID rules, with `_` permitted before one or more continuation characters. A `Symbol` contains ASCII operator characters or non-ASCII punctuation and symbols. Lexical and symbol values retain their Unicode spelling. Character membership follows the JavaScript runtime's Unicode tables. The HashQL compiler handles normalization. A `BaseUrl` retains the source spelling of a validated HTTP(S) URL ending in `/`. An object literal remains unchecked until {@link make} validates it.
 */
export type Ident = Ident.Lexical | Ident.Symbol | Ident.BaseUrl;

export declare namespace Ident {
  /** An unquoted name whose value follows the lexical identifier grammar. */
  export interface Lexical extends $Schema.Schema.Type<typeof LexicalSchema> {}

  /** An operator name stored without its source backticks. */
  export interface Symbol extends $Schema.Schema.Type<typeof SymbolSchema> {}

  /** A base-URL name stored without its source backticks. */
  export interface BaseUrl extends $Schema.Schema.Type<typeof BaseUrlSchema> {}
}

/** Identifier source text, with backticks around a quoted symbol or base URL. */
export type Encoded = (typeof Schema)["Encoded"];

/** Input accepted by {@link make} before validation: an identifier object, not source text. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks an identifier object, such as `{ _tag: "Symbol", value: "+" }`, against its kind's pattern.
 *
 * Use {@link decodeResult} for source text. Without `_tag`, the result takes the kind whose pattern matches `value`.
 *
 * @throws {Error} If `value` is not valid for the given kind. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Ident =
  SchemaParser.make(Schema);

/** Checks an identifier object like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Ident, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Checks an identifier object like {@link make}, returning `None` if validation fails. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Ident> = SchemaParser.makeOption(Schema);

/** Parses one identifier with typed reasons and a UTF-16 error offset, preserving its spelling. */
export const parse: (
  input: string,
) => Result.Result<
  Ident,
  ParserError.ParserError<
    ParserError.IdentReason | ParserError.ExpectedEndOfInput
  >
> = Grammar.parseIdent;

/** Source text accepted by the identifier grammar, paired with the identifier it parses to. */
export type Sample = Parser.Sample<Ident>;

/** Generates source text and its parsed identifier from the identifier grammar. */
export const arbitrary: () => Arbitrary.Arbitrary<Sample> =
  Grammar.completeIdentifier.arbitrary;

/**
 * Decodes exactly one identifier from source text.
 *
 * A symbol can be bare or backticked. A base URL requires backticks. Any other text, including surrounding whitespace or a `::` separator, fails with a {@link SchemaIssue.Issue} in the returned `Result`.
 *
 * @example <caption>Decode an operator and print it back.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const plus = Result.getOrThrow(JExpr.Ident.decodeResult("+"));
 * assert.deepEqual(plus, { _tag: "Symbol", value: "+" });
 * assert.equal(JExpr.Ident.compile(plus), "`+`");
 * assert.ok(Result.isFailure(JExpr.Ident.decodeResult("user.name")));
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const decodeResult: (
  input: string,
  options?: ParseOptions,
) => Result.Result<Ident, SchemaIssue.Issue> =
  SchemaParser.decodeResult(Schema);

/**
 * Writes an identifier as source text.
 *
 * Quotes symbols and base URLs in backticks, so the bare `+` decodes and compiles to `` `+` ``, while lexical values keep their spelling.
 *
 * Nothing validates the value first.
 */
export const compile: (ident: Ident) => string = Grammar.compileIdent;
