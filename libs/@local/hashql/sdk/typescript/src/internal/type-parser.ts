/** Recursive path and type productions. Union has higher precedence than intersection. @internal */
import { Option, Result, flow, pipe } from "effect";

import { characterClass } from "./character-class.js";
import { identifier } from "./ident-parser.js";
import {
  cut,
  preceded,
  repeat,
  separated,
  skip,
  suspend,
} from "./parser-combinator.js";
import * as Parser from "./parser.js";

import type { Path, SegmentArgument } from "../JExpr/Path.js";
import type { Type } from "../JExpr/Type/schema.js";
import type { IdentReason } from "./ident-parser.js";
import type {
  ExpectedEndOfInput,
  ExpectedLiteral,
  ExpectedProgress,
  ParserError,
} from "./parser-error.js";

/** All syntax and semantic reasons this recursive grammar can report. */
export type TypeReason = IdentReason | ExpectedEndOfInput | ExpectedProgress;
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

/** Recursive type grammar shared by path arguments and parenthesized types. */
export const typeSyntax: TypeParser = suspend(
  // oxlint-disable-next-line no-use-before-define -- Resolved after module initialization.
  () => ws(typeIntersection),
);

const argument = pipe(
  typeSyntax,
  Parser.map((bound): SegmentArgument => ({ _tag: "GenericArgument", bound })),
);
const constraint = pipe(
  identifier,
  skip(colon),
  Parser.and(typeSyntax),
  Parser.map(([name, bound]): SegmentArgument => ({
    _tag: "GenericConstraint",
    name,
    bound,
  })),
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
  Parser.map(([name, args]) => ({ name, arguments: args })),
);
const root = pipe(ws(token("::")), Parser.optional, Parser.map(Option.isSome));

/** Prefix parser for paths with arguments on any segment. */
export const path: Parser.Parser<Path, TypeReason> = pipe(
  root,
  Parser.and(separated(ws(token("::")))(segment)),
  Parser.map(([rooted, segments]) => ({ rooted, segments })),
);

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
  Parser.map(([[name, bound], rest]): Type => ({
    _tag: "Struct",
    members: [[name, bound], ...rest],
  })),
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

const atom = Parser.choice(reference, infer, paren);

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
export const completePath: Parser.Parser<Path, TypeReason> = Parser.eof(path);

/** Parses a complete path without converting its structured failures to optional absence. */
export const parsePath: (
  input: string,
) => Result.Result<Path, ParserError<TypeReason>> = flow(
  completePath.parse,
  Result.map((state) => state.output),
);
