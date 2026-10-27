/**
 * Tuple type syntax, written `(A, B)`, `(A,)` or `()`.
 *
 * {@link make} checks a decoded object such as `{ _tag: "Tuple", members: [a, b] }` rather than source text. It accepts any number of members and checks the paths and identifiers inside each one. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @module
 */
import * as Overflow from "../../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.Tuple = Defs.Tuple;

export interface Tuple extends Defs.TupleType {}

export declare namespace Tuple {
  export interface Encoded extends Defs.TupleEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded tuple object and returns it.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Tuple =
  Overflow.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Tuple, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Tuple> = Overflow.makeOption(Schema);
