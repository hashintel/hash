/**
 * Struct type syntax, written `(name: T)`, or `(:)` without members.
 *
 * {@link make} checks a decoded object such as `{ _tag: "Struct", members: [[name, type]] }` rather than source text, so each member name is an identifier object. It checks each name and the paths and identifiers inside each type. {@link makeEffect} fails with the {@link SchemaIssue.Issue} instead of throwing. {@link makeOption} returns `None` instead.
 *
 * @module
 */
import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.Struct = Defs.Struct;

export interface Struct extends Defs.StructType {}
export interface Encoded extends Defs.StructEncoded {}

type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a decoded struct object and returns it.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Struct =
  SchemaParser.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Struct, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Struct> = SchemaParser.makeOption(Schema);
