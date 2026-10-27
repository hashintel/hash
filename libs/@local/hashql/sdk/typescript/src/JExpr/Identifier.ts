import { SchemaParser } from "effect";

import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Identifier} values. */
export const Schema: typeof Defs.Identifier = Defs.Identifier;

/**
 * Source text interpreted as a path, type or argument shorthand.
 *
 * The schema accepts any string, including the empty string. HashQL parses it according to its position in the expression. In an expression position, `"user"` is a path, `"user.name"` and `"items[0]"` access a field and an element, and `"_"` is a placeholder. In a call argument, `":user"` is shorthand for the labeled argument `{":user": "user"}`. A type position reads the text as type syntax. For a single identifier object, see `JExpr.Ident`.
 */
export type Identifier = Defs.IdentifierType;

export declare namespace Identifier {
  /** The schema-encoded representation of {@link Identifier}. */
  export type Encoded = Defs.IdentifierEncoded;
}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Accepts any string as a string expression.
 *
 * The schema has no checks, so this confirms only that the input is a string. HashQL parses the text when it compiles the program. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Identifier = SchemaParser.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Identifier, SchemaIssue.Issue> =
  SchemaParser.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Identifier> = SchemaParser.makeOption(Schema);
