import * as Overflow from "../internal/overflow.js";
import * as Defs from "./schema.js";

import type { Schema as $Schema, Effect, Option, SchemaIssue } from "effect";

/** Schema for {@link Dict} values. */
export const Schema: typeof Defs.Dict = Defs.Dict;

/**
 * A dictionary constructor with string keys or expression-keyed entries.
 *
 * Record keys are literal strings. In an array of pairs, both the key and the value are expressions, so the string key `"user.name"` below is a field access rather than literal text.
 *
 * @example <caption>Compare a literal key with a computed key.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 *
 * const literalKey = JExpr.dict({ "user.name": JExpr.literal("Alice") });
 * assert.equal(JExpr.compile(literalKey), '{"#dict":{"user.name":{"#literal":"Alice"}}}');
 *
 * const computedKey = JExpr.dict([["user.name", JExpr.literal("Alice")]]);
 * assert.equal(JExpr.compile(computedKey), '{"#dict":[["user.name",{"#literal":"Alice"}]]}');
 * ```
 */
export interface Dict extends Defs.DictType {}
/** The schema-encoded representation of {@link Dict}. */
export interface Encoded extends Defs.DictEncoded {}

/** Input accepted by {@link make} before validation. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks dictionary entries and an optional type annotation.
 *
 * Record keys can be any string, and `#type` can be any text. Each value, and each key in the pair form, must be an expression. The result is a new dictionary. `options.disableChecks` skips the identifier, label and numeric-spelling checks inside nested values but keeps the structural requirements. Use {@link makeOption} to test validity or {@link makeEffect} to retain the validation issue.
 *
 * @throws {Error} If validation fails. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Dict =
  Overflow.make(Schema);

/** Checks a value like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Dict, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/** Checks a value like {@link make}, returning `None` instead of throwing for a schema failure. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Dict> = Overflow.makeOption(Schema);
