import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Dict} values. */
export const Schema: typeof Defs.Dict = Defs.Dict;

/**
 * A dictionary constructor with string keys or expression-keyed entries.
 *
 * Record keys are literal strings. In an array of pairs, both the key and the value are expressions.
 *
 * @example
 * ```ts
 * import * as JExpr from "./index.js";
 *
 * JExpr.compile(JExpr.dict({ "user.name": JExpr.literal("Alice") }));
 * // => '{"#dict":{"user.name":{"#literal":"Alice"}}}'
 *
 * JExpr.compile(JExpr.dict([["user.name", JExpr.literal("Alice")]]));
 * // => '{"#dict":[["user.name",{"#literal":"Alice"}]]}'
 * ```
 */
export interface Dict extends Defs.DictType {}
/** The schema-encoded representation of {@link Dict}. */
export interface Encoded extends Defs.DictEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks dictionary entries and an optional type annotation.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Dict =
  SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Dict, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Dict> = SchemaParser.makeOption(Schema);
