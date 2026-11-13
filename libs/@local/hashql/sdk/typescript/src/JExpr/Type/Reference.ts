/**
 * Type syntax that names a type by path, such as `List<Integer>`.
 *
 * {@link make} checks a decoded object whose `path` is a path object rather than path source text. It requires at least one segment and checks every identifier and generic argument in the path. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @since 0.1.0
 * @module
 */

import * as Overflow from "../../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/**
 * Schema for {@link Reference} values.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const Schema: typeof Defs.Reference = Defs.Reference;

/**
 * Type syntax naming a type by its decoded path, with ordered generic entries on each segment.
 *
 * {@link JExpr."type"} and {@link JExpr.newtype} also accept a reference as a declaration name. There its generic list declares parameters: a bare name such as `T` is an unbounded parameter and `T: Integer` a bounded one.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Reference extends Defs.ReferenceType {}

export declare namespace Reference {
  export interface Encoded extends Defs.ReferenceEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded reference object and returns it.
 *
 * @throws `Error` If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Reference =
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
) => Effect.Effect<Reference, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

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
) => Option.Option<Reference> = Overflow.makeOption(Schema);
