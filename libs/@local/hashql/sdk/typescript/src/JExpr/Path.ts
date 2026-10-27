/**
 * HashQL paths with an optional root and generic arguments on each segment.
 *
 * Decode `module<T>::Item<U: Bound>` with {@link parse} for structured parser failures or {@link decodeResult} for schema issues. {@link compile} writes the supported syntax back, preserving identifier spelling and argument order. This module handles SDK syntax, not the complete HashQL language. Normalization, name resolution and language validation belong to the HashQL compiler.
 *
 * @module
 */
import { SchemaParser } from "effect";

import * as Overflow from "../internal/overflow.js";
import { compilePath } from "../internal/type-compile.js";
import * as Type from "./Type/schema.js";

import type { Parser } from "../internal/parser.js";
import type * as Ident from "./Ident.js";
import type * as ParserError from "./ParserError.js";
import type {
  Schema as $Schema,
  Arbitrary,
  Effect,
  Equal,
  Option,
  Pipeable,
  Result,
  SchemaIssue,
} from "effect";
import type { ParseOptions } from "effect/SchemaAST";

interface GenericArgument extends Equal.Equal, Pipeable.Pipeable {
  readonly _tag: "GenericArgument";
  readonly bound: Type.Type;
}

interface GenericConstraint extends Equal.Equal, Pipeable.Pipeable {
  readonly _tag: "GenericConstraint";
  readonly name: Ident.Ident;
  readonly bound: Type.Type;
}

/** A positional type argument or a named constraint with a required bound. */
export type SegmentArgument = GenericArgument | GenericConstraint;

/** One path name and the generic entries attached to that name. */
export interface Segment extends Equal.Equal, Pipeable.Pipeable {
  readonly name: Ident.Ident;
  readonly arguments: readonly SegmentArgument[];
}

/**
 * A nonempty sequence of segments. `rooted` records a leading `::`.
 *
 * Equality and hashing use rootedness and ordered segments, including names, argument kinds and nested type syntax. They do not normalize syntax or resolve names. Construction validates and copies ordinary field records, but it can share existing class instances and does not freeze the result. Do not mutate them or their nested syntax after comparison or hashing, because Effect caches those results.
 */
export interface Path extends Equal.Equal, Pipeable.Pipeable {
  readonly rooted: boolean;
  readonly segments: readonly [Segment, ...Segment[]];
}

/** Constructs a positional path argument from decoded type syntax. */
export const GenericArgument = Type.PathGenericArgument;
/** Constructs a named path constraint from a decoded name and type. */
export const GenericConstraint = Type.PathGenericConstraint;

/** Validates a segment argument with decoded names and types. */
export const SegmentArgument: typeof Type.PathArgument = Type.PathArgument;
/** Validates a decoded path segment. An empty argument array omits angle brackets. */
export const Segment: typeof Type.PathSegment = Type.PathSegment;
/** Validates path objects, including the recursive types in every argument. */
export const SchemaFromSelf: typeof Type.PathFromSelf = Type.PathFromSelf;

/** Writes canonical path text without validating the supplied object. */
export const compile: (path: Path) => string = compilePath;

/**
 * Codec between source text and a decoded {@link Path}.
 *
 * A syntax failure decodes to an `Encoding` issue. Its inner `InvalidValue` issue keeps the parser error in `annotations.parserError`, beside a message naming the UTF-16 offset. Use {@link parse} to inspect the typed reason union. Argument types encode as text, so a single-member union or intersection decodes as its member.
 */
export const Schema: typeof Type.PathSchema = Type.PathSchema;
export declare namespace Path {
  /** Source text representing a path. */
  export type Encoded = typeof Schema.Encoded;
}
/** Constructor input for a decoded path, not source syntax. */
type MakeIn = (typeof Schema)["~type.make.in"];

/**
 * Validates a decoded path, requiring at least one segment and constructing protocol-bearing segments and arguments.
 *
 * The constructor accepts ordinary field records and preserves an existing instance's identity. The schema construction options apply to nested values too.
 *
 * @throws {Error} If a name, argument type or path structure fails validation. The error's `cause` is a {@link SchemaIssue.Issue}.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- schema constructor
export const make: (input: MakeIn, options?: $Schema.MakeOptions) => Path =
  Overflow.make(Schema);

/** Validates a decoded path with the {@link SchemaIssue.Issue} in the effect's failure channel. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- schema constructor
export const makeEffect: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Effect.Effect<Path, SchemaIssue.Issue> = Overflow.makeEffect(Schema);

/** Validates a decoded path, returning `None` if validation fails. */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- schema constructor
export const makeOption: (
  input: MakeIn,
  options?: $Schema.MakeOptions,
) => Option.Option<Path> = Overflow.makeOption(Schema);

/**
 * Parses a complete path with typed reasons and UTF-16 error offsets.
 *
 * The grammar admits ASCII spaces, tabs and line breaks around separators and generic delimiters. A plain relative path does not admit surrounding whitespace. A leading root or closing generic delimiter can consume it. Each generic list is nonempty and has no trailing comma. Type arguments support inference, paths, groups, tuples, structs, unions and intersections. Union has higher precedence than intersection. A struct whose field names repeat after decoding fails with {@link ParserError.DuplicateStructField}. Input nested deeper than the call stack allows fails with {@link ParserError.NestingTooDeep} at offset 0.
 *
 * @example
 * ```ts
 * import assert from "node:assert/strict";
 * import { Result } from "effect";
 * import { JExpr } from "@local/hashql";
 *
 * const path = Result.getOrThrow(JExpr.Path.parse("::module<T>::Item<U: A | B>"));
 * assert.equal(JExpr.Path.compile(path), "::module<T>::Item<U: A | B>");
 * assert.equal(path.segments[0].arguments.length, 1);
 * ```
 */
export const parse: (
  input: string,
) => Result.Result<Path, ParserError.ParserError<ParserError.TypeReason>> =
  Type.pathGrammar.parsePath;

/** Source text accepted by the path grammar, paired with the path it parses to. */
export type Sample = Parser.Sample<Path>;

/** Generates supported path source and its parsed value. Depth bounds generation, not the parser's call stack. */
export const arbitrary: () => Arbitrary.Arbitrary<Sample> =
  Type.pathGrammar.completePath.arbitrary;

/**
 * Decodes path source through the schema, retaining syntax details in the returned issue.
 */
// oxlint-disable-next-line effecttsgo/missing-pipeable-signature -- schema decoder
export const decodeResult: (
  input: string,
  options?: ParseOptions,
) => Result.Result<Path, SchemaIssue.Issue> = SchemaParser.decodeResult(Schema);
