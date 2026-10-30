import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Call} values. */
export const Schema: typeof Defs.Call = Defs.Call;

/**
 * A function expression followed by positional or labeled arguments.
 *
 * The array contains at least the function expression. A function with no arguments is a one-element array.
 */
export type Call = Defs.CallType;
/** The schema-encoded representation of {@link Call}. */
export type Encoded = Defs.CallEncoded;

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a call's structure and every nested expression.
 *
 * The array needs at least the function expression, and each later element must be an expression or a labeled argument. The result is a new array. `options.disableChecks` skips the identifier, label and numeric-spelling checks inside nested values but keeps the structural requirements. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Call =
  Overflow.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Call, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Call> = Overflow.makeOption(Schema);
