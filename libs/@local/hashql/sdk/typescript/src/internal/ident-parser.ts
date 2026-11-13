/** Identifier productions shared by standalone names and recursive type paths. @internal */
import { Data, Result, Schema, flow, pipe } from "effect";

import { characterClass, xidContinue, xidStart } from "./character-class.js";
import { preceded, skip } from "./parser-combinator.js";
import * as Parser from "./parser.js";

import type { CharacterClass } from "./character-class.js";
import type {
  ExpectedCharacterClass,
  ExpectedEndOfInput,
  ExpectedLiteral,
  ParserError,
} from "./parser-error.js";

/** A URL-shaped identifier that is not an HTTP(S) URL ending in a slash. */
export interface InvalidBaseUrl {
  readonly _tag: "InvalidBaseUrl";
  readonly value: string;
}

export const InvalidBaseUrl: Data.TaggedEnum.Constructor<InvalidBaseUrl>["InvalidBaseUrl"] =
  Data.taggedEnum<InvalidBaseUrl>().InvalidBaseUrl;

/** Failures of an identifier prefix parse. */
export type IdentReason =
  | ExpectedCharacterClass
  | ExpectedLiteral
  | InvalidBaseUrl;

/** Identifier forms accepted by the grammar. */
export type Ident = Ident.Lexical | Ident.Symbol | Ident.BaseUrl;

export declare namespace Ident {
  /** A lexical identifier retaining its source spelling. */
  export interface Lexical {
    readonly _tag: "Lexical";
    readonly value: string;
  }

  /** An operator identifier retaining its source spelling without backticks. */
  export interface Symbol {
    readonly _tag: "Symbol";
    readonly value: string;
  }

  /** The original ASCII spelling of a validated HTTP(S) URL ending in a slash. */
  export interface BaseUrl {
    readonly _tag: "BaseUrl";
    readonly value: string;
  }
}

export const symbolCharacter: CharacterClass = characterClass({
  name: "operator character",
  pattern: String.raw`[!#$%&*+\-./<=>?@\\^|~\[\]]|[^\x00-\x7F](?<=\p{P}|\p{S})`,
});
export const urlCharacter: CharacterClass = characterClass({
  name: "URL character",
  pattern: String.raw`[A-Za-z0-9!#$%&'()*+,\-./:;=?@\[\]_~]`,
});

/** One or more characters from a class, retaining the complete spelling. */
const word = (
  characters: CharacterClass,
): Parser.Parser<string, ExpectedCharacterClass> =>
  pipe(
    Parser.make(),
    Parser.charIn(characters),
    Parser.takeWhile(characters),
    Parser.map(([[, first], rest]) => first + rest),
  );

const token = <const T extends string>(
  text: T,
): Parser.Parser<T, ExpectedLiteral> =>
  pipe(
    Parser.make(),
    Parser.literal(text),
    Parser.map(([, value]) => value),
  );

const backtick = token("`");

export const lexicalValue: Parser.Parser<
  string,
  ExpectedCharacterClass | ExpectedLiteral
> = pipe(
  Parser.choice(
    pipe(
      Parser.make(),
      Parser.charIn(xidStart),
      Parser.map(([, first]) => first),
    ),
    pipe(
      token("_"),
      Parser.charIn(xidContinue),
      Parser.map(([first, second]) => first + second),
    ),
  ),
  Parser.takeWhile(xidContinue),
  Parser.map(([first, rest]) => first + rest),
);

export const symbolValue: Parser.Parser<string, ExpectedCharacterClass> =
  word(symbolCharacter);

const validatedBaseUrl = pipe(
  word(urlCharacter),
  Parser.tryMap((value) =>
    pipe(
      Schema.decodeResult(Schema.URLFromString)(value),
      Result.map(() => value),
      Result.mapError(() => InvalidBaseUrl({ value })),
      Result.filterOrFail(
        (url) => /^https?:/iu.test(url) && value.endsWith("/"),
        () => InvalidBaseUrl({ value }),
      ),
    ),
  ),
);

/** URL candidates use HTTP(S) domain names. Validation also admits other WHATWG URL spellings. */
const baseUrlCandidate = pipe(
  Parser.choice(token("http"), token("https")),
  Parser.literal("://"),
  Parser.and(word(characterClass({ name: "domain letter", pattern: "[a-z]" }))),
  Parser.literal(".example/"),
);

export const baseUrlValue: Parser.Parser<
  string,
  ExpectedCharacterClass | InvalidBaseUrl
> = Parser.from({
  parse: validatedBaseUrl.parse,
  schema: baseUrlCandidate.schema,
});

const lexical = pipe(
  lexicalValue,
  Parser.map((value): Ident.Lexical => ({ _tag: "Lexical", value })),
);
const symbol = pipe(
  symbolValue,
  Parser.map((value): Ident.Symbol => ({ _tag: "Symbol", value })),
);
const baseUrl = pipe(
  baseUrlValue,
  Parser.map((value): Ident.BaseUrl => ({ _tag: "BaseUrl", value })),
);

/** Accepts backticks around symbols or URLs, never lexical names. */
const quoted = Parser.choice(
  pipe(symbol, skip(backtick), preceded(backtick)),
  pipe(baseUrl, skip(backtick), preceded(backtick)),
);

/** Prefix parser with lexical priority where Unicode classes overlap. */
export const identifier: Parser.Parser<Ident, IdentReason> = Parser.choice(
  quoted,
  lexical,
  symbol,
);
/** Full-consumption identifier parser, retaining offsets and semantic reasons. */
export const completeIdentifier: Parser.Parser<
  Ident,
  IdentReason | ExpectedEndOfInput
> = Parser.eof(identifier);

/** Writes decoded names, quoting nonlexical names. */
export const compileIdent = (ident: Ident): string =>
  ident._tag === "Lexical" ? ident.value : `\`${ident.value}\``;

/** Decodes one name without discarding structured failures. */
export const parseIdent: (
  input: string,
) => Result.Result<Ident, ParserError<IdentReason | ExpectedEndOfInput>> = flow(
  completeIdentifier.parse,
  Result.map((state) => state.output),
);
