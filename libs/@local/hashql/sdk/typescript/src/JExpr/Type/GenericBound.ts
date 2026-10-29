/**
 * A named generic parameter with an optional bound, such as the `T: Integer` in `List<T: Integer>`.
 *
 * {@link make} checks a decoded object such as `{ _tag: "GenericBound", name, bound }`, whose `name` is an identifier object rather than source text and whose `bound` may be absent. It checks the name and the paths and identifiers inside the bound. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @module
 */

import * as Overflow from "../../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.GenericBound = Defs.GenericBound;

export interface GenericBound extends Defs.GenericBoundType {}

export declare namespace GenericBound {
  export interface Encoded extends Defs.GenericBoundEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded generic bound object and returns it.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => GenericBound = Overflow.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<GenericBound, SchemaIssue.Issue> =
  Overflow.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<GenericBound> = Overflow.makeOption(Schema);
