import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link List} values. */
export const Schema: typeof Defs.List = Defs.List;

/**
 * A list constructor whose elements are expressions.
 *
 * The schema checks each expression. HashQL determines their common element type.
 */
export interface List extends Defs.ListType {}
/** The schema-encoded representation of {@link List}. */
export interface Encoded extends Defs.ListEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks list elements and an optional type annotation.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => List =
  SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<List, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<List> = SchemaParser.makeOption(Schema);
