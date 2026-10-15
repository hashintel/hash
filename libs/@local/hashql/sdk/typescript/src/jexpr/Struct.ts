import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Struct} values. */
export const Schema: typeof Defs.Struct = Defs.Struct;

/**
 * A data constructor with identifier-named fields.
 *
 * Each field contains an expression. The schema checks the field names as well as their values.
 */
export interface Struct extends Defs.StructType {}
/** The schema-encoded representation of {@link Struct}. */
export interface Encoded extends Defs.StructEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks field names, field expressions and an optional type annotation.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Struct =
  SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Struct, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Struct> = SchemaParser.makeOption(Schema);
