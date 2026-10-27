import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for `Tuple` values. */
export const Schema: typeof Defs.Tuple = Defs.Tuple;

/**
 * A fixed-length sequence of expressions with a type for each position.
 *
 * An empty tuple is valid. HashQL determines each element's type.
 */
export interface Tuple extends Defs.TupleType {}

export declare namespace Tuple {
  /** The schema-encoded representation of `Tuple`. */
  export interface Encoded extends Defs.TupleEncoded {}
}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks tuple elements and an optional type annotation.
 *
 * Each element must be an expression, and `#type` can be any text. The result is a new tuple. `options.disableChecks` skips the identifier, label and numeric-spelling checks inside nested values but keeps the structural requirements. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Tuple =
  Overflow.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Tuple, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Tuple> = Overflow.makeOption(Schema);
