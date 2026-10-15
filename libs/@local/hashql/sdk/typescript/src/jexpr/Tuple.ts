import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Tuple} values. */
export const Schema: typeof Defs.Tuple = Defs.Tuple;

/**
 * A fixed-length sequence of expressions with a type for each position.
 *
 * An empty tuple is valid. HashQL determines each element's type.
 */
export interface Tuple extends Defs.TupleType {}
/** The schema-encoded representation of {@link Tuple}. */
export interface Encoded extends Defs.TupleEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks tuple elements and an optional type annotation.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Tuple =
  SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Tuple, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Tuple> = SchemaParser.makeOption(Schema);
