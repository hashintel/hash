import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Integer} values. */
export const Schema: typeof Defs.Integer = Defs.Integer;

/**
 * An arbitrary-precision integer's decimal source text.
 *
 * `value` uses JSON integer syntax, such as `"-42"`. It has no fraction or exponent. Keeping the text avoids JavaScript's numeric precision limit.
 *
 * @example
 * ```ts
 * import * as JExpr from "./index.js";
 *
 * JExpr.compile(JExpr.integer(42)); // => '{"#literal":42}'
 * JExpr.compile(JExpr.integer(2n ** 64n)); // => '{"#literal":18446744073709551616}'
 * ```
 */
export interface Integer extends Defs.IntegerType {}
/** The schema-encoded representation of {@link Integer}. */
export interface Encoded extends Defs.IntegerEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks the spelling of an integer literal.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Integer =
  SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Integer, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Integer> = SchemaParser.makeOption(Schema);
