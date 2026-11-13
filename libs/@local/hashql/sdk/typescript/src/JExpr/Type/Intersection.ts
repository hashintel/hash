/**
 * Intersection type syntax, written `A & B`.
 *
 * {@link make} checks a decoded object such as `{ _tag: "Intersection", members: [a, b] }` rather than source text. It requires at least one member and checks the paths and identifiers inside each one. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @module
 */

import * as Overflow from "../../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.Intersection = Defs.Intersection;

export interface Intersection extends Defs.IntersectionType {}

export declare namespace Intersection {
  export interface Encoded extends Defs.IntersectionEncoded {}
}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded intersection object and returns it.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Intersection = Overflow.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Intersection, SchemaIssue.Issue> =
  Overflow.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Intersection> = Overflow.makeOption(Schema);
