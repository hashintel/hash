import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Integer} values. */
export const Schema: typeof Defs.Integer = Defs.Integer;

/**
 * An arbitrary-precision integer's decimal source text, stored in a literal's `#literal` field.
 *
 * `value` uses JSON integer syntax, such as `"-42"`. It has no fraction or exponent. Keeping the text avoids JavaScript's numeric precision limit, but a `number` loses precision before `JExpr.integer` reads it. Pass a `bigint` for integers beyond `Number.MAX_SAFE_INTEGER`.
 *
 * @example <caption>Keep an integer beyond JavaScript's safe range.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 *
 * assert.equal(JExpr.compile(JExpr.integer(2n ** 64n)), '{"#literal":18446744073709551616}');
 * assert.equal(JExpr.compile(JExpr.integer(2 ** 53 + 1)), '{"#literal":9007199254740992}');
 * ```
 */
export interface Integer extends Defs.IntegerType {}
/** The schema-encoded representation of {@link Integer}. */
export interface Encoded extends Defs.IntegerEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks that `value` is an integer in JSON number syntax, such as `-42`.
 *
 * Leading zeros, a fraction and an exponent fail. `_tag` may be omitted, and the result supplies it. `options.disableChecks` skips the spelling check and keeps only the object's shape. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Integer =
  SchemaParser.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Integer, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Integer> = SchemaParser.makeOption(Schema);
