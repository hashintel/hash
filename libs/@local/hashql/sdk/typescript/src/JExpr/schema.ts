import { Result, Schema, flow } from "effect";

import { parseIdent } from "../internal/ident-parser.js";

import type { SchemaAST } from "effect";
import type { ReadonlyRecord } from "effect/Record";

/** A deferred reference that permits expressions to contain other expressions. */
type ExpressionRef = Schema.suspend<
  Schema.Codec<ExpressionType, ExpressionEncoded>
>;
const ExpressionRef: ExpressionRef = Schema.suspend(
  // oxlint-disable-next-line no-use-before-define -- recursive schema
  (): Schema.Codec<ExpressionType, ExpressionEncoded> => Expression,
);

/** Whether `input` is a single identifier in source form, such as `name`, `+` or `` `+` ``. */
const isIdentSource = flow(parseIdent, Result.isSuccess);

/**
 * A path, a type expression or a labeled-argument shorthand.
 *
 * The schema accepts any string. HashQL parses it according to its position in the expression.
 */
export const Identifier: Schema.String = Schema.String.pipe(
  Schema.brand("~hashql/Identifier"),
);

/** The value described by {@link Identifier}. */
export type IdentifierType = typeof Identifier.Type;
/** The schema-encoded form of {@link Identifier}. */
export type IdentifierEncoded = Schema.Codec.Encoded<typeof Identifier>;

/**
 * Requires every key to start with `prefix` followed by a complete identifier.
 *
 * Checking the whole record rejects invalid keys that `Schema.Record` would otherwise skip when matching a key schema.
 */
const hasIdentKeys = (
  prefix: string,
  expected: string,
): SchemaAST.Filter<ReadonlyRecord<string, ExpressionType>> =>
  Schema.makeFilter(
    (record: ReadonlyRecord<string, ExpressionType>) =>
      Object.keys(record)
        .filter(
          (key) =>
            !key.startsWith(prefix) || !isIdentSource(key.slice(prefix.length)),
        )
        .map((key) => ({ path: [key], issue: `Expected ${expected}` })),
    { expected },
  );

/** Colon-prefixed key text, before {@link hasIdentKeys} validates the identifier. */
const LabelKey: Schema.TemplateLiteral<readonly [":", Schema.String]> =
  Schema.TemplateLiteral([":", Schema.String]);

/**
 * A labeled call argument, such as `{":name": value}`.
 *
 * It can appear anywhere after the function in a call array. HashQL's parser gathers labeled arguments into their own list, so a labeled argument takes no positional slot.
 */
export const LabeledArgument: Schema.$Record<typeof LabelKey, ExpressionRef> =
  Schema.Record(LabelKey, ExpressionRef).check(
    hasIdentKeys(":", "`:` followed by an identifier"),
    Schema.isMinProperties(1),
    Schema.isMaxProperties(1),
  );

/** The value described by {@link LabeledArgument}. */
export interface LabeledArgumentType extends Schema.Schema.Type<
  typeof LabeledArgument
> {}
/** The schema-encoded form of {@link LabeledArgument}. */
export interface LabeledArgumentEncoded extends Schema.Codec.Encoded<
  typeof LabeledArgument
> {}

/** A nonempty call array, starting with the function expression. */
export const Call: Schema.TupleWithRest<
  Schema.Tuple<readonly [ExpressionRef]>,
  readonly [Schema.Union<readonly [ExpressionRef, typeof LabeledArgument]>]
> = Schema.TupleWithRest(Schema.Tuple([ExpressionRef]), [
  Schema.Union([ExpressionRef, LabeledArgument]),
]);

/** The value described by {@link Call}. */
export type CallType = readonly [
  ExpressionType,
  ...(ExpressionType | LabeledArgumentType)[],
];
/** The schema-encoded form of {@link Call}. */
export type CallEncoded = readonly [
  ExpressionEncoded,
  ...(ExpressionEncoded | LabeledArgumentEncoded)[],
];

/** A data constructor with identifier-named fields and an optional type annotation. */
export const Struct: Schema.Struct<{
  "#struct": Schema.$Record<Schema.String, ExpressionRef>;
  "#type": Schema.optionalKey<typeof Identifier>;
}> = Schema.Struct({
  "#struct": Schema.Record(Schema.String, ExpressionRef).check(
    hasIdentKeys("", "an identifier"),
  ),
  "#type": Identifier.pipe(Schema.optionalKey),
});

/** The value described by {@link Struct}. */
export interface StructType extends Schema.Schema.Type<typeof Struct> {}
/** The schema-encoded form of {@link Struct}. */
export interface StructEncoded extends Schema.Codec.Encoded<typeof Struct> {}

/** A fixed-length sequence of expressions and an optional type annotation. */
export const Tuple: Schema.Struct<{
  "#tuple": Schema.$Array<ExpressionRef>;
  "#type": Schema.optionalKey<typeof Identifier>;
}> = Schema.Struct({
  "#tuple": Schema.Array(ExpressionRef),
  "#type": Identifier.pipe(Schema.optionalKey),
});

/** The value described by {@link Tuple}. */
export interface TupleType extends Schema.Schema.Type<typeof Tuple> {}
/** The schema-encoded form of {@link Tuple}. */
export interface TupleEncoded extends Schema.Codec.Encoded<typeof Tuple> {}

/** A dictionary of string-keyed values or expression pairs, with an optional type annotation. */
export const Dict: Schema.Struct<{
  "#dict": Schema.Union<
    readonly [
      Schema.$Record<Schema.String, ExpressionRef>,
      Schema.$Array<Schema.Tuple<readonly [ExpressionRef, ExpressionRef]>>,
    ]
  >;
  "#type": Schema.optionalKey<typeof Identifier>;
}> = Schema.Struct({
  "#dict": Schema.Union([
    Schema.Record(Schema.String, ExpressionRef),
    Schema.Array(Schema.Tuple([ExpressionRef, ExpressionRef])),
  ]),
  "#type": Identifier.pipe(Schema.optionalKey),
});

/** The value described by {@link Dict}. */
export interface DictType extends Schema.Schema.Type<typeof Dict> {}
/** The schema-encoded form of {@link Dict}. */
export interface DictEncoded extends Schema.Codec.Encoded<typeof Dict> {}

/** A list of expressions and an optional type annotation. */
export const List: Schema.Struct<{
  "#list": Schema.$Array<ExpressionRef>;
  "#type": Schema.optionalKey<typeof Identifier>;
}> = Schema.Struct({
  "#list": Schema.Array(ExpressionRef),
  "#type": Identifier.pipe(Schema.optionalKey),
});

/** The value described by {@link List}. */
export interface ListType extends Schema.Schema.Type<typeof List> {}
/** The schema-encoded form of {@link List}. */
export interface ListEncoded extends Schema.Codec.Encoded<typeof List> {}

/**
 * An integer literal in JSON number syntax, such as `-42`.
 *
 * Keeping the text preserves integers beyond JavaScript's numeric precision limit.
 */
export const Integer: Schema.TaggedStruct<"Integer", { value: Schema.String }> =
  Schema.TaggedStruct("Integer", {
    value: Schema.String.check(
      Schema.isPattern(/^-?(?:0|[1-9]\d*)$/u, {
        expected: "an integer in JSON number syntax",
      }),
    ),
  });

/** The value described by {@link Integer}. */
export interface IntegerType extends Schema.Schema.Type<typeof Integer> {}
/** The schema-encoded form of {@link Integer}. */
export interface IntegerEncoded extends Schema.Codec.Encoded<typeof Integer> {}

/**
 * A float literal in JSON number syntax with a fraction or exponent, such as `1.0` or `1e3`.
 *
 * HashQL reads a number as a float only if its text contains a fraction or exponent. The stored text preserves that distinction.
 */
export const Float: Schema.TaggedStruct<"Float", { value: Schema.String }> =
  Schema.TaggedStruct("Float", {
    value: Schema.String.check(
      Schema.isPattern(
        /^-?(?:0|[1-9]\d*)(?:\.\d+(?:[eE][+-]?\d+)?|[eE][+-]?\d+)$/u,
        { expected: "a float in JSON number syntax" },
      ),
    ),
  });

/** The value described by {@link Float}. */
export interface FloatType extends Schema.Schema.Type<typeof Float> {}
/** The schema-encoded form of {@link Float}. */
export interface FloatEncoded extends Schema.Codec.Encoded<typeof Float> {}

/** A primitive value, with tagged source text for numbers and an optional type annotation. */
export const Literal: Schema.Struct<{
  "#literal": Schema.Union<
    readonly [
      Schema.String,
      typeof Integer,
      typeof Float,
      Schema.Boolean,
      Schema.Null,
    ]
  >;
  "#type": Schema.optionalKey<typeof Identifier>;
}> = Schema.Struct({
  "#literal": Schema.Union([
    Schema.String,
    Integer,
    Float,
    Schema.Boolean,
    Schema.Null,
  ]),
  "#type": Identifier.pipe(Schema.optionalKey),
});

/** The value described by {@link Literal}. */
export interface LiteralType extends Schema.Schema.Type<typeof Literal> {}
/** The schema-encoded form of {@link Literal}. */
export interface LiteralEncoded extends Schema.Codec.Encoded<typeof Literal> {}

/** The recursive union of calls, data constructors and string expressions. */
export const Expression: Schema.Union<
  readonly [
    typeof Call,
    typeof Struct,
    typeof Tuple,
    typeof Dict,
    typeof List,
    typeof Literal,
    typeof Identifier,
  ]
> = Schema.Union([Call, Struct, Tuple, Dict, List, Literal, Identifier]);

/** The value described by {@link Expression}. */
export type ExpressionType =
  | CallType
  | StructType
  | TupleType
  | DictType
  | ListType
  | LiteralType
  | IdentifierType;
/** The schema-encoded form of {@link Expression}. */
export type ExpressionEncoded =
  | CallEncoded
  | StructEncoded
  | TupleEncoded
  | DictEncoded
  | ListEncoded
  | LiteralEncoded
  | IdentifierEncoded;
