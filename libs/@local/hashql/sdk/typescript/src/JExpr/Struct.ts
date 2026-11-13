import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for `Struct` values. */
export const Schema: typeof Defs.Struct = Defs.Struct;

/**
 * A data constructor with identifier-named fields.
 *
 * Each field contains an expression. The schema checks the field names as well as their values.
 */
export interface Struct extends Defs.StructType {}
/** The schema-encoded representation of `Struct`. */
export interface Encoded extends Defs.StructEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks field names, field expressions and an optional type annotation.
 *
 * Field names must be identifiers, such as `name` or `` `+` ``. Field values must be expressions. `#type` can be any text. The result is a new struct. `options.disableChecks` skips the field-name check and the checks inside nested values. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Struct =
  Overflow.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Struct, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Struct> = Overflow.makeOption(Schema);
