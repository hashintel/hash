import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link LabeledArgument} values. */
export const Schema: typeof Defs.LabeledArgument = Defs.LabeledArgument;

/**
 * A call argument labeled with a parameter name.
 *
 * The object has exactly one key: `:` followed by an identifier. The value is an expression. It can appear anywhere after the function in a call array, and HashQL's parser gathers it into the call's labeled arguments rather than its positional ones.
 */
export interface LabeledArgument extends Defs.LabeledArgumentType {}

export declare namespace LabeledArgument {
  /** The schema-encoded representation of {@link LabeledArgument}. */
  export interface Encoded extends Defs.LabeledArgumentEncoded {}
}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a labeled argument's single key and its value.
 *
 * The object needs exactly one key, `:` followed by an identifier, and an expression as its value. `options.disableChecks` skips the key checks along with the checks inside the value. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => LabeledArgument = Overflow.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<LabeledArgument, SchemaIssue.Issue> =
  Overflow.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<LabeledArgument> = Overflow.makeOption(Schema);
