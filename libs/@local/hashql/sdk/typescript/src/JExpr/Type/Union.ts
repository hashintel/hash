/**
 * Union type syntax, written `A | B`.
 *
 * {@link make} checks a decoded object such as `{ _tag: "Union", members: [a, b] }` rather than source text. It requires at least one member and checks the paths and identifiers inside each one. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @module
 */
import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.Union = Defs.Union;

export interface Union extends Defs.UnionType {}
export interface Encoded extends Defs.UnionEncoded {}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded union object and returns it.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Union =
  SchemaParser.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Union, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Union> = SchemaParser.makeOption(Schema);
