/**
 * Failures of `Ident.parse` and `Path.parse`.
 *
 * A {@link ParserError} records the UTF-16 offset of the furthest failure and the set of reasons expected there. Each reason is a tagged value that a caller narrows by `_tag` instead of reading a message. The package exports this module as types alone.
 *
 * @since 0.1.0
 * @module
 */
export type {
  ExpectedCharacterClass,
  ExpectedEndOfInput,
  ExpectedLiteral,
  ExpectedProgress,
  ParserError,
  Reason,
} from "../internal/parser-error.js";
export type { IdentReason, InvalidBaseUrl } from "../internal/ident-parser.js";
export type {
  DuplicateStructField,
  NestingTooDeep,
  TypeReason,
} from "../internal/type-parser.js";
