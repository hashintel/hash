/**
 * A positional generic argument, such as the `Integer` in `List<Integer>`.
 *
 * {@link make} checks a decoded object such as `{ _tag: "GenericArgument", bound: integer }` rather than source text, including the paths and identifiers inside its type. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @since 0.1.0
 * @module
 */

import * as Overflow from "../../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/**
 * @category Schemas
 * @since 0.1.0
 */
export const Schema: typeof Defs.GenericArgument = Defs.GenericArgument;

/**
 * @category Models
 * @since 0.1.0
 */
export interface GenericArgument extends Defs.GenericArgumentType {}

export declare namespace GenericArgument {
  export interface Encoded extends Defs.GenericArgumentEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded generic argument object and returns it.
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
) => GenericArgument = Overflow.make(Schema);

/**
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<GenericArgument, SchemaIssue.Issue> =
  Overflow.makeEffect(Schema);

/**
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<GenericArgument> = Overflow.makeOption(Schema);
