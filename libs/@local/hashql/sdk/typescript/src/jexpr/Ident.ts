/**
 * Single HashQL identifiers and their source spelling.
 *
 * An {@link Ident} stores its kind and its value without backticks, like `Ident` in `hashql-core`. Use {@link decodeResult} to read source syntax such as `foo`, `+`, `` `+` `` or `` `https://example.com/` ``, and {@link compile} to write it back. Paths, field access and the `_` placeholder are wider string expressions rather than identifiers.
 *
 * @module
 */
import { Schema as $Schema, Option, SchemaGetter, SchemaParser } from "effect";
import { compose } from "effect/Function";

import * as Scan from "../internal/scan.js";
import { characterClass, exactly } from "../internal/schema-arbitrary.js";

import type { Effect, SchemaIssue } from "effect";
import type { Result } from "effect/Result";
import type { ParseOptions } from "effect/SchemaAST";

const lexicalStart = new RegExp(Scan.lexicalStartPattern, "u");
const lexicalContinue = new RegExp(Scan.lexicalContinuePattern, "u");
const symbolCharacter = new RegExp(Scan.symbolCharacterPattern, "u");

const LexicalSchema: $Schema.TaggedStruct<
  "Lexical",
  { value: $Schema.String }
> = $Schema.TaggedStruct("Lexical", {
  value: exactly(Scan.lexicalPattern, () =>
    Scan.lexicalPattern
      .replaceAll(Scan.lexicalStartPattern, characterClass(lexicalStart))
      .replaceAll(Scan.lexicalContinuePattern, characterClass(lexicalContinue)),
  ),
});

const SymbolSchema: $Schema.TaggedStruct<"Symbol", { value: $Schema.String }> =
  $Schema.TaggedStruct("Symbol", {
    value: exactly(Scan.symbolPattern, () =>
      Scan.symbolPattern.replace(
        Scan.symbolCharacterPattern,
        characterClass(symbolCharacter),
      ),
    ),
  });

const BaseUrlSchema: $Schema.TaggedStruct<
  "BaseUrl",
  { value: $Schema.String }
> = $Schema.TaggedStruct("BaseUrl", { value: exactly(Scan.baseUrlPattern) });

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
    decode: SchemaGetter.transformOptional(
      compose(
        Option.andThen(Scan.scanIdentExact),
        // oxlint-disable-next-line no-use-before-define -- lazy evaluation that is otherwise circular
        Option.map((value) => fromScanned(value)),
      ),
    ),
    // oxlint-disable-next-line no-use-before-define -- lazy evaluation that is otherwise circular
    encode: SchemaGetter.transform((value) => compile(value)),
  }),
);

/**
 * The decoded form of an identifier, with its kind in `_tag` and its value without backticks.
 *
 * A `Lexical` value is a Unicode identifier, either `XID_Start XID_Continue*` or `_` followed by at least one `XID_Continue` character. A `Symbol` value is one or more ASCII operator characters, `!#$%&*+-./<=>?@\^|~[]`, or non-ASCII punctuation and symbols, such as `+` or `==`. A `BaseUrl` value is an `http` or `https` URL ending in `/`, checked for spelling rather than validity. An object written directly is unchecked until {@link make} validates it.
 */
export type Ident = (typeof Schema)["Type"];

/** Identifier source text, with backticks around a quoted symbol or base URL. */
export type Encoded = (typeof Schema)["Encoded"];

/** Input accepted by {@link make} before validation: an identifier object, not source text. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks an identifier object, such as `{ _tag: "Symbol", value: "+" }`, against its kind's pattern.
 *
 * Use {@link decodeResult} for source text. When `_tag` is omitted, the result takes the kind whose pattern matches `value`.
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

/** @internal */
export const fromScanned = (scanned: Scan.ScanIdent): Ident => ({
  _tag: scanned.kind,
  value: scanned.value,
});

/**
 * Decodes exactly one identifier from source text.
 *
 * A symbol can be bare or backticked. A base URL must be backticked. Any other text, including surrounding whitespace or a `::` separator, fails with a {@link SchemaIssue.Issue} in the returned `Result`.
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
) => Result<Ident, SchemaIssue.Issue> = SchemaParser.decodeResult(Schema);

/**
 * Writes an identifier as source text.
 *
 * A lexical value is written as is. A symbol or base URL is wrapped in backticks, so the bare `+` decodes and compiles to `` `+` ``. The value is not validated.
 */
export const compile = (ident: Ident): string => {
  if (ident._tag === "Lexical") {
    return ident.value;
  }

  return `\`${ident.value}\``;
};
