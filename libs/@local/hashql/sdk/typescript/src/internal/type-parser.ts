/** Recursive path and type productions. Union has higher precedence than intersection. @internal */
import { Data, MutableHashSet, Option, Result, pipe } from "effect";

import * as Ident from "../JExpr/Ident.js";
import { characterClass } from "./character-class.js";
import { identifier } from "./ident-parser.js";
import { isStackOverflow } from "./overflow.js";
import {
  cut,
  preceded,
  repeat,
  separated,
  skip,
  suspend,
} from "./parser-combinator.js";
import { ParserError } from "./parser-error.js";
import * as Parser from "./parser.js";

import type { Path, Segment, SegmentArgument } from "../JExpr/Path.js";
import type { Type } from "../JExpr/Type/schema.js";
import type { IdentReason } from "./ident-parser.js";
import type {
  ExpectedEndOfInput,
  ExpectedLiteral,
  ExpectedProgress,
} from "./parser-error.js";

/** The input nests deeper than the call stack lets the parser follow. Its offset is 0, because the parser cannot tell where the stack ran out. */
export interface NestingTooDeep {
  readonly _tag: "NestingTooDeep";
}

export const NestingTooDeep: Data.TaggedEnum.Constructor<NestingTooDeep>["NestingTooDeep"] =
  Data.taggedEnum<NestingTooDeep>().NestingTooDeep;

/** A struct type names the same field twice. Its offset is the end of the struct, because the parser compares names after it reads every field. */
export interface DuplicateStructField {
  readonly _tag: "DuplicateStructField";
  readonly name: Ident.Ident;
}

export const DuplicateStructField: Data.TaggedEnum.Constructor<DuplicateStructField>["DuplicateStructField"] =
  Data.taggedEnum<DuplicateStructField>().DuplicateStructField;

/** All syntax and semantic reasons this recursive grammar can report. */
export type TypeReason =
  | IdentReason
  | ExpectedEndOfInput
  | ExpectedProgress
  | NestingTooDeep
  | DuplicateStructField;
type TypeParser = Parser.Parser<Type, TypeReason>;

const token = <const T extends string>(
  text: T,
): Parser.Parser<T, ExpectedLiteral> =>
  pipe(
    Parser.make(),
    Parser.literal(text),
    Parser.map(([, value]) => value),
  );
const whitespace = pipe(
  Parser.make(),
  Parser.takeWhile(
    characterClass({ name: "ASCII whitespace", pattern: "[ \\t\\r\\n]" }),
  ),
);
const ws = <T, R extends TypeReason>(
  parser: Parser.Parser<T, R>,
): Parser.Parser<T, R> => pipe(parser, preceded(whitespace), skip(whitespace));
const comma = ws(token(","));
const colon = ws(token(":"));
const closeParen = ws(cut(token(")")));
const infer = pipe(
  token("_"),
  Parser.map((): Type => ({ _tag: "Infer" })),
);

/** Syntax constructors that the schema module supplies after initializing its classes. */
export interface PathConstructors {
  readonly argument: (bound: Type) => SegmentArgument;
  readonly constraint: (name: Ident.Ident, bound: Type) => SegmentArgument;
  readonly segment: (
    name: Ident.Ident,
    args: readonly SegmentArgument[],
  ) => Segment;
  readonly path: (
    rooted: boolean,
    segments: readonly [Segment, ...Segment[]],
  ) => Path;
}

/** Recursive productions used by path parsing and source generation. */
export interface Grammar {
  readonly path: Parser.Parser<Path, TypeReason>;
  readonly typeSyntax: TypeParser;
  readonly completePath: Parser.Parser<Path, TypeReason>;
  readonly parsePath: (
    input: string,
  ) => Result.Result<Path, ParserError<TypeReason>>;
}

// The struct schema rejects repeated names, so the parser rejects them before a caller can build a struct the schema refuses. Names compare by `Ident.name`, as the schema's check compares them, so two spellings of one name are a repeat.
const distinctFields = (
  members: readonly (readonly [Ident.Ident, Type])[],
): Result.Result<Type, DuplicateStructField> => {
  const seen = MutableHashSet.empty<Ident.Name>();
  for (const [name] of members) {
    const interned = Ident.name(name);
    if (MutableHashSet.has(seen, interned)) {
      return Result.fail(DuplicateStructField({ name }));
    }

    MutableHashSet.add(seen, interned);
  }

  return Result.succeed({ _tag: "Struct", members });
};

/** Groups, tuples and structs share the enclosing recursive type parser. */
const typeAtom = (
  typeSyntax: TypeParser,
  path: Parser.Parser<Path, TypeReason>,
): TypeParser => {
  const reference = pipe(
    path,
    Parser.map((value): Type => ({ _tag: "Reference", path: value })),
  );

  const structField = pipe(
    identifier, //
    skip(cut(colon)),
    Parser.and(typeSyntax),
  );

  const struct = pipe(
    identifier,
    skip(colon),
    Parser.and(typeSyntax),
    Parser.and(repeat(preceded(comma)(structField))),
    skip(Parser.optional(token(","))),
    skip(closeParen),
    Parser.tryMap(([first, rest]) => distinctFields([first, ...rest])),
  );

  const tupleTail = pipe(
    typeSyntax,
    separated(comma),
    skip(Parser.optional(token(","))),
    Parser.optional,
    Parser.map(Option.getOrElse((): readonly Type[] => [])),
    preceded(token(",")),
    skip(closeParen),
  );

  const groupOrTuple = pipe(
    typeSyntax,
    Parser.and(
      Parser.choice(
        pipe(
          token(")"),
          Parser.map(() => Option.none<readonly Type[]>()),
        ),
        pipe(tupleTail, Parser.map(Option.some)),
      ),
    ),
    Parser.map(([first, tail]): Type =>
      Option.match(tail, {
        onNone: () => first,
        onSome: (rest) => ({ _tag: "Tuple", members: [first, ...rest] }),
      }),
    ),
  );

  const paren = pipe(
    Parser.choice(
      pipe(
        token(":"),
        skip(token(")")),
        Parser.map((): Type => ({ _tag: "Struct", members: [] })),
      ),
      pipe(
        token(")"),
        Parser.map((): Type => ({ _tag: "Tuple", members: [] })),
      ),
      struct,
      groupOrTuple,
    ),
    cut,
    preceded(ws(token("("))),
  );

  return Parser.choice(reference, infer, paren);
};

/** Builds the recursive grammar without importing its runtime value implementations. */
export const makeGrammar = (construct: PathConstructors): Grammar => {
  /** Recursive type grammar shared by path arguments and parenthesized types. */
  const typeSyntax: TypeParser = suspend(
    // oxlint-disable-next-line no-use-before-define -- Resolved after module initialization.
    () => ws(typeIntersection),
  );

  const argument = pipe(
    typeSyntax,
    Parser.map((bound): SegmentArgument => construct.argument(bound)),
  );
  const constraint = pipe(
    identifier,
    skip(colon),
    Parser.and(typeSyntax),
    Parser.map(([name, bound]): SegmentArgument =>
      construct.constraint(name, bound),
    ),
  );
  const argumentsList = pipe(
    Parser.choice(constraint, argument),
    separated(comma),
    preceded(ws(token("<"))),
    skip(ws(cut(token(">")))),
    Parser.optional,
    Parser.map(Option.getOrElse((): readonly SegmentArgument[] => [])),
  );
  const segment = pipe(
    identifier,
    Parser.and(argumentsList),
    Parser.map(([name, args]) => construct.segment(name, args)),
  );
  const root = pipe(
    ws(token("::")),
    Parser.optional,
    Parser.map(Option.isSome),
  );

  /** Prefix parser for paths with arguments on any segment. */
  const path: Parser.Parser<Path, TypeReason> = pipe(
    root,
    Parser.and(separated(ws(token("::")))(segment)),
    Parser.map(([rooted, segments]) => construct.path(rooted, segments)),
  );

  const atom = typeAtom(typeSyntax, path);

  const typeUnion = pipe(
    atom,
    separated(ws(token("|"))),
    Parser.map(([first, ...rest]): Type =>
      rest.length === 0 ? first : { _tag: "Union", members: [first, ...rest] },
    ),
  );

  const typeIntersection = pipe(
    typeUnion,
    separated(ws(token("&"))),
    Parser.map(([first, ...rest]): Type =>
      rest.length === 0
        ? first
        : { _tag: "Intersection", members: [first, ...rest] },
    ),
  );

  /** Requires complete path consumption, including any trailing whitespace the grammar permits. */
  const completePath: Parser.Parser<Path, TypeReason> = Parser.eof(path);

  /** Parses a complete path without converting its structured failures to optional absence. A stack overflow fails with {@link NestingTooDeep}. */
  const parsePath = (
    input: string,
  ): Result.Result<Path, ParserError<TypeReason>> => {
    try {
      return Result.map(completePath.parse(input), (state) => state.output);
    } catch (error) {
      if (isStackOverflow(error)) {
        return Result.fail(ParserError.at(0, NestingTooDeep()));
      }

      throw error;
    }
  };

  return { path, typeSyntax, completePath, parsePath };
};
