import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Float} values. */
export const Schema: typeof Defs.Float = Defs.Float;

/**
 * A float's source text, including a fraction or exponent.
 *
 * `value` uses JSON number syntax, such as `"1.0"` or `"1e3"`. Keeping the text preserves the distinction between an integer and an integral float.
 */
export interface Float extends Defs.FloatType {}
/** The schema-encoded representation of {@link Float}. */
export interface Encoded extends Defs.FloatEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks that `value` is a float in JSON number syntax, such as `1.0` or `1e3`.
 *
 * The text needs a fraction or exponent, so `1` and `1.` fail. The input may omit `_tag`, which the result supplies. `options.disableChecks` skips the spelling check and keeps only the object's shape. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Float =
  SchemaParser.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Float, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Float> = SchemaParser.makeOption(Schema);
