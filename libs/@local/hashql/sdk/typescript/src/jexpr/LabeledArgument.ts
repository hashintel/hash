import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link LabeledArgument} values. */
export const Schema: typeof Defs.LabeledArgument = Defs.LabeledArgument;

/**
 * A call argument labeled with a parameter name.
 *
 * The object has exactly one key: `:` followed by an identifier. The value is an expression. The argument still occupies a position in the call's argument list.
 */
export interface LabeledArgument extends Defs.LabeledArgumentType {}
/** The schema-encoded representation of {@link LabeledArgument}. */
export interface Encoded extends Defs.LabeledArgumentEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a single labeled argument and its value.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => LabeledArgument = SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<LabeledArgument, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<LabeledArgument> = SchemaParser.makeOption(Schema);
