/**
 * Failures of `Ident.parse` and `Path.parse`.
 *
 * A {@link ParserError} records the UTF-16 offset of the furthest failure and the set of reasons expected there. Each reason is a tagged value that a caller narrows by `_tag` instead of reading a message. The package exports this module as types alone.
 *
 * @module
 */
import type * as Ident from "../internal/ident-parser.js";
import type * as Internal from "../internal/parser-error.js";

export type { Reason } from "../internal/parser-error.js";
export type { IdentReason } from "../internal/ident-parser.js";
export type { TypeReason } from "../internal/type-parser.js";

// The names below are also constructors in their source modules. The declaration bundler drops `type` from a re-export inside the namespace it builds, which would declare runtime values this module does not have. Each one is an alias instead.

/**
 * Failure reasons at a UTF-16 offset from the beginning of the supplied input.
 *
 * Reasons in `expected` compare by value, so equal reasons appear once.
 */
export type ParserError<R extends Internal.Reason> = Internal.ParserError<R>;

/** A repeated parser succeeded without consuming input. */
export type ExpectedProgress = Internal.ExpectedProgress;

/** Input remains where the grammar requires its end. */
export type ExpectedEndOfInput = Internal.ExpectedEndOfInput;

/** The input does not match an exact source spelling. */
export type ExpectedLiteral = Internal.ExpectedLiteral;

/** The next scalar is absent or outside a named character class. */
export type ExpectedCharacterClass = Internal.ExpectedCharacterClass;

/** A URL-shaped identifier that is not an HTTP(S) URL ending in a slash. */
export type InvalidBaseUrl = Ident.InvalidBaseUrl;
