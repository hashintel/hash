import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Identifier} values. */
export const Schema: typeof Defs.Identifier = Defs.Identifier;

/**
 * Source text interpreted as a path, type or argument shorthand.
 *
 * The schema accepts any string. HashQL parses it according to its position in the expression. For example, `"user"` is a path and `":user"` is a labeled-argument shorthand in a call.
 */
export type Identifier = Defs.IdentifierType;
/** The schema-encoded representation of {@link Identifier}. */
export type Encoded = Defs.IdentifierEncoded;

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Accepts source text for a string expression.
 *
 * Validates by default. `options.disableChecks` skips schema checks. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Identifier = SchemaParser.make(Schema);

/** Runs {@link make} validation with schema issues in the effect's error channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Identifier, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Runs {@link make} validation, returning `None` for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Identifier> = SchemaParser.makeOption(Schema);
