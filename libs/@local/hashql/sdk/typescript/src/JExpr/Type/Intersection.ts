/**
 * Intersection type syntax, written `A & B`.
 *
 * {@link make} checks a decoded object such as `{ _tag: "Intersection", members: [a, b] }` rather than source text. It requires at least one member and checks the paths and identifiers inside each one. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @since 0.1.0
 * @module
 */

import * as Overflow from "../../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/**
 * Schema for {@link Intersection} values.
 *
 * @category Schemas
 * @since 0.1.0
 */
export const Schema: typeof Defs.Intersection = Defs.Intersection;

/**
 * Type syntax for a value of every member type, with annotation text `A & B`.
 *
 * @category Models
 * @since 0.1.0
 */
export interface Intersection extends Defs.IntersectionType {}

export declare namespace Intersection {
  export interface Encoded extends Defs.IntersectionEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded intersection object and returns it.
 *
 * @throws `Error` If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Intersection = Overflow.make(Schema);

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
) => Effect.Effect<Intersection, SchemaIssue.Issue> =
  Overflow.makeEffect(Schema);

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
) => Option.Option<Intersection> = Overflow.makeOption(Schema);
