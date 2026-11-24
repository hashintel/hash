/**
 * List constructors, written `{ "#list": [a, b] }`.
 *
 * {@link @local/hashql#JExpr.list | `JExpr.list`} assembles one without checking it. {@link make} checks a finished value against {@link Schema}. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @since 0.1.0
 * @module
 */

import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/**
 * Schema for {@link List} values.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const Schema: typeof Defs.List = Defs.List;

/**
 * A list constructor whose elements are expressions.
 *
 * The schema checks each expression. HashQL determines their common element type.
 *
 * @category Models
 * @since 0.1.0
 */
export interface List extends Defs.ListType {}

export declare namespace List {
  /** The schema-encoded representation of {@link List}. */
  export interface Encoded extends Defs.ListEncoded {}
}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks list elements and an optional type annotation.
 *
 * Each element must be an expression, and `#type` can be any text. The result is a new list. `options.disableChecks` skips the identifier, label and numeric-spelling checks inside nested values but keeps the structural requirements. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws `Error` If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => List =
  Overflow.make(Schema);

/**
 * Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing.
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<List, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/**
 * Checks a value like {@link make}, returning `None` instead of throwing for a schema failure.
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<List> = Overflow.makeOption(Schema);
