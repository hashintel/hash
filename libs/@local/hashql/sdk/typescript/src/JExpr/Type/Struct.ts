/**
 * Struct type syntax, written `(name: T)`, or `(:)` without members.
 *
 * {@link make} checks a decoded object such as `{ _tag: "Struct", members: [[name, type]] }` rather than source text, so each member name is an identifier object. It checks each name, that no two share a {@link @local/hashql#JExpr.Ident.name | name}, and the paths and identifiers inside each type. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
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
export const Schema: typeof Defs.Struct = Defs.Struct;

/**
 * @category Models
 * @since 0.1.0
 */
export interface Struct extends Defs.StructType {}

export declare namespace Struct {
  export interface Encoded extends Defs.StructEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded struct object and returns it.
 *
 * @throws `Error` If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 *
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Struct =
  Overflow.make(Schema);

/**
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Struct, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/**
 * @category Constructors
 * @since 0.1.0
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Struct> = Overflow.makeOption(Schema);
