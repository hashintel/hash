/**
 * HashQL identifiers.
 *
 * An {@link Ident} stores its kind and its value without backticks, like `Ident`
 * in `hashql-core`. Use {@link decodeResult} to read source syntax such as `foo`, `+`,
 * `` `+` `` or `` `https://example.com/` ``, and {@link compile} to write it back.
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
 * Encoding quotes symbol and base-URL identifiers. Arbitrary generation uses the decoded {@link SchemaFromSelf}.
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

export type Ident = (typeof Schema)["Type"];

export type Encoded = (typeof Schema)["Encoded"];

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Constructs an identifier from its tagged object representation.
 *
 * @throws {Error} If `value` is not valid for the given kind.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Ident =
  SchemaParser.make(Schema);

/** Constructs an identifier with schema failures in the error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Ident, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Constructs an identifier, returning `None` if validation fails. */
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

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const decodeResult: (
  input: string,
  options?: ParseOptions,
) => Result<Ident, SchemaIssue.Issue> = SchemaParser.decodeResult(Schema);

export const compile = (ident: Ident): string => {
  if (ident._tag === "Lexical") {
    return ident.value;
  }

  return `\`${ident.value}\``;
};
