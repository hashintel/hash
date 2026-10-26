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
 * Each element must be an expression, and `#type` can be any text. The result is a new list. `options.disableChecks` skips the identifier, label and numeric-spelling checks inside nested values but keeps the structural requirements. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => List =
  SchemaParser.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<List, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<List> = SchemaParser.makeOption(Schema);
