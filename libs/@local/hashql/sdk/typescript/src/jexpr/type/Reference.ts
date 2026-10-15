import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.Reference = Defs.Reference;

/**
 * Type syntax naming a type by its decoded path, with its generic entries in order.
 *
 * `JExpr.type` and `JExpr.newtype` also accept a reference as a declaration name. There its generic list declares parameters: a bare name such as `T` is an unbounded parameter and `T: Integer` a bounded one.
 */
export interface Reference extends Defs.ReferenceType {}
export interface Encoded extends Defs.ReferenceEncoded {}

type MakeIn = (typeof Schema)["~type.make.in"];

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Reference =
  SchemaParser.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Reference, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Reference> = SchemaParser.makeOption(Schema);
