/**
 * HashQL paths with an optional root and a nonempty sequence of identifiers.
 *
 * {@link SchemaFromSelf} validates path objects and supports schema-derived arbitrary generation. {@link Schema} and {@link decodeResult} decode source text without treating `::` inside a quoted identifier as a separator, and {@link compile} writes it back. Path text is narrower than a string expression, which can also hold field access, index access or generic arguments.
 *
 * @module
 */
import {
  Schema as $Schema,
  Array,
  Option,
  SchemaGetter,
  SchemaParser,
  Struct,
} from "effect";
import { compose } from "effect/Function";

import * as Scan from "../internal/scan.js";
import * as Ident from "./Ident.js";

import type { Effect, SchemaIssue } from "effect";
import type { Result } from "effect/Result";
import type { ParseOptions } from "effect/SchemaAST";

/**
 * Schema for path objects containing decoded identifiers.
 *
 * `Arbitrary.schema(SchemaFromSelf)` generates rooted and relative paths with at least one segment.
 */
export const SchemaFromSelf: $Schema.Struct<{
  rooted: $Schema.Boolean;
  segments: $Schema.NonEmptyArray<typeof Ident.SchemaFromSelf>;
}> = $Schema.Struct({
  rooted: $Schema.Boolean,
  segments: $Schema.NonEmptyArray(Ident.SchemaFromSelf),
});

/** Codec between path source text and a {@link Path} object. */
export const Schema: $Schema.decodeTo<
  typeof SchemaFromSelf,
  typeof $Schema.NonEmptyString
> = $Schema.NonEmptyString.pipe(
  $Schema.decodeTo(SchemaFromSelf, {
    decode: SchemaGetter.transformOptional(
      compose(
        Option.andThen(Scan.scanPath),
        Option.map(
          Struct.evolve({
            segments: Array.map(Ident.fromScanned),
          }),
        ),
      ),
    ),
    // oxlint-disable-next-line no-use-before-define -- circular evaluation
    encode: SchemaGetter.transform((path) => compile(path)),
  }),
);

/**
 * The decoded form of a path, with its root flag and its identifier segments in order.
 *
 * `rooted` is `true` for a leading `::`, as in `::core::math`. `segments` holds at least one identifier object from `JExpr.Ident`. An object written directly is unchecked until {@link make} validates it.
 */
export interface Path extends $Schema.Schema.Type<typeof Schema> {}

/** Source text representing a {@link Path}, including quotes and separators. */
export type Encoded = $Schema.Codec.Encoded<typeof Schema>;

/** Input accepted by {@link make} before validation: a path object, not source text. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Checks a path object, requiring at least one segment and a valid identifier in each.
 *
 * Use {@link decodeResult} for source text.
 *
 * @throws {Error} If a segment is not a valid identifier or `segments` is empty. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Path =
  SchemaParser.make(Schema);

/** Checks a path object like {@link make}, failing the synchronous effect with the issue instead of throwing. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Path, SchemaIssue.Issue> = SchemaParser.makeEffect(Schema);

/** Checks a path object like {@link make}, returning `None` if validation fails. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Path> = SchemaParser.makeOption(Schema);

/**
 * Writes a path as source text.
 *
 * Segments are joined by `::`, with a leading `::` for a rooted path, and each segment is written like `JExpr.Ident.compile`, with backticks around a symbol or base URL. Whitespace that decoding accepted around separators is not kept. The segments are not validated.
 */
export const compile = (path: Path): string => {
  const segments = path.segments
    .map((segment) => Ident.compile(segment))
    .join("::");

  if (path.rooted) {
    return `::${segments}`;
  }

  return segments;
};

/**
 * Decodes path text into a {@link Path}.
 *
 * The text is an optional leading `::` followed by `::`-separated identifiers, with whitespace allowed around each separator. A backticked base URL, such as `` `https://example.com/a::b/` ``, can contain `::`. Surrounding whitespace, an empty segment, generic arguments such as `List<T>` and field access such as `user.name` fail with a {@link SchemaIssue.Issue} in the returned `Result`.
 *
 * @example <caption>Decode a rooted operator path.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { JExpr } from "@local/hashql";
 * import { Result } from "effect";
 *
 * const add = Result.getOrThrow(JExpr.Path.decodeResult("::core :: math::+"));
 * assert.ok(JExpr.Path.isAbsolute(add));
 * assert.equal(JExpr.Path.compile(add), "::core::math::`+`");
 * assert.ok(Result.isFailure(JExpr.Path.decodeResult("List<Integer>")));
 * ```
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- false positive
export const decodeResult: (
  input: string,
  options?: ParseOptions,
) => Result<Path, SchemaIssue.Issue> = SchemaParser.decodeResult(Schema);

/** Whether the path starts with `::`. */
export const isAbsolute = (path: Path): boolean => path.rooted;

/** Whether the path has no leading `::`. */
export const isRelative = (path: Path): boolean => !path.rooted;
