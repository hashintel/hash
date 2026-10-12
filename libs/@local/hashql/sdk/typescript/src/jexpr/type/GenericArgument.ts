import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

export const Schema: typeof Defs.GenericArgument = Defs.GenericArgument;

export interface GenericArgument extends Defs.GenericArgumentType {}
export interface Encoded extends Defs.GenericArgumentEncoded {}

type MakeIn = (typeof Schema)["~type.make.in"];

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => GenericArgument = SchemaParser.make(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<GenericArgument, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<GenericArgument> = SchemaParser.makeOption(Schema);
