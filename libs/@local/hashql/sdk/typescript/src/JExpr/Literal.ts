import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Literal} values. */
export const Schema: typeof Defs.Literal = Defs.Literal;

/**
 * A primitive value in a `#literal` constructor.
 *
 * A numeric value is a `JExpr.Integer` or `JExpr.Float` object that preserves its source text. Strings, booleans and `null` appear directly under `#literal`, and a string here is a string value rather than a name. `#type` holds optional annotation text.
 */
export interface Literal extends Defs.LiteralType {}
/** The schema-encoded representation of {@link Literal}. */
export interface Encoded extends Defs.LiteralEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a literal's value and an optional type annotation.
 *
 * A string, boolean or `null` value passes as is. A numeric value must be a tagged integer or float object with valid spelling, and the input may omit its `_tag`. `#type` can be any text. `options.disableChecks` skips the numeric spelling check. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Literal =
  SchemaParser.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Literal, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Literal> = SchemaParser.makeOption(Schema);
