// The format string supported is the same one as weald/debugjs, very simple, just:
// `%type`, more sophisticated formatting is supported by other libraries, but we don't need those.
// This is because this is simply a polyfill to interop with libp2p's logger.

import { isPeerId } from "@libp2p/interface";
import { isMultiaddr } from "@multiformats/multiaddr";
import {
  type LogLevel,
  Effect,
  Inspectable,
  Option,
  pipe,
  Predicate,
  Record,
  String,
} from "effect";
import { CID } from "multiformats";
import { base32 } from "multiformats/bases/base32";
import { base58btc } from "multiformats/bases/base58";
import { base64 } from "multiformats/bases/base64";

type Alpha =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";

/** @internal */
export type FormatterSpecifier = Alpha | Uppercase<Alpha>;

/** @internal */
export type Formatter = (value: unknown) => Option.Option<string>;

/** @internal */
export type FormatterCollection = Readonly<{
  [key in FormatterSpecifier]?: Formatter;
}>;

interface Format {
  type: FormatterSpecifier;
}

interface Literal {
  value: string;
}

type Token = Format | Literal;

const tokenize = (spec: string) => {
  const tokens: Token[] = [];

  let rest = spec;

  while (rest.length > 0) {
    const nextToken = rest.search(/%[a-z%]/i);

    if (nextToken === -1) {
      tokens.push({ value: rest });
      break;
    }

    tokens.push({ value: rest.slice(0, nextToken) });

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- guaranteed by regex
    const type = rest[nextToken + 1]!;

    if (type === "%") {
      tokens.push({ value: "%" });
    } else {
      tokens.push({ type: type as FormatterSpecifier });
    }

    rest = rest.slice(nextToken + 2);
  }

  return tokens;
};

const enrichContext = (
  context: Record<string, unknown>,
  index: number,
  value: unknown,
) => {
  const name = pipe(
    value?.constructor.name,
    Option.fromNullable,
    Option.map(String.uncapitalize),
    Option.filter((_) => !Record.has(context, _)),
    Option.getOrElse(() => `unknown${index}`),
  );

  // eslint-disable-next-line no-param-reassign
  context[name] = value;
};

/** @internal */
export const format = (
  formatters: FormatterCollection,
  level: LogLevel.LogLevel,
  input: unknown,
  args: readonly unknown[],
) => {
  const inputArguments = [...args];
  const context: Record<string, unknown> = {};

  let formatString;

  // special casing of some arguments
  if (Predicate.isError(input)) {
    context.error = input;
    formatString = input.stack ?? input.message;
  } else if (Predicate.isString(input)) {
    formatString = input;
  } else {
    // predicate is an object, add it to the context and use the `%O` formatter
    context.object = input;
    // push the object to the arguments
    inputArguments.unshift(input);

    formatString = "%O";
  }

  const tokens = tokenize(formatString);
  let output = "";

  let argumentIndex = 0;

  for (const token of tokens) {
    if (Predicate.hasProperty(token, "value")) {
      output = output + token.value;
      continue;
    }

    if (argumentIndex >= inputArguments.length) {
      output = `${output}???`;
      continue;
    }

    const argument = inputArguments[argumentIndex];

    enrichContext(context, argumentIndex, argument);

    argumentIndex = argumentIndex + 1;

    const formatOutput = pipe(
      formatters[token.type],
      Option.liftPredicate(Predicate.isNotUndefined),
      Option.ap(Option.some(argument)),
      Option.flatten,
      Option.getOrElse(() => "???"),
    );

    output = output + formatOutput;
  }

  // add any arguments to the context that were not used
  for (let i = argumentIndex; i < inputArguments.length; i = i + 1) {
    enrichContext(context, i, inputArguments[i]);
  }

  return Effect.logWithLevel(level, output).pipe(Effect.annotateLogs(context));
};

const nonEmptyString = (value?: string) =>
  pipe(
    Option.fromNullable(value),
    Option.map(String.trim),
    Option.filter(String.isNonEmpty),
  );

// Taken from weald/debugjs
const debugJsFormatters: FormatterCollection = {
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  s: (value: unknown) => Option.some((value as object).toString()),
  d: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, Predicate.isNumber), //
      Option.map((number) => number.toString()),
    ),
  // eslint-disable-next-line unicorn/prevent-abbreviations
  j: (value: unknown) => Option.some(JSON.stringify(value)),
  // eslint-disable-next-line @typescript-eslint/naming-convention
  O: (value: unknown) => Option.some(Inspectable.toStringUnknown(value)),
  o: (value: unknown) =>
    Option.some(Inspectable.toStringUnknown(value, "").replaceAll("\n", " ")),
};

// Taken from libp2p/logger
const libp2pFormatters: FormatterCollection = {
  /**
   * Custom (more sane) UTF-8 first formatter.
   */
  // eslint-disable-next-line @typescript-eslint/naming-convention
  B: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, Predicate.isUint8Array),
      Option.map((array) =>
        pipe(
          // first try to see if this is a utf8 string
          Option.liftThrowable((_: Uint8Array) =>
            new TextDecoder("utf-8", { fatal: true }).decode(_),
          )(array),
          // if that fails, just show the hex
          Option.getOrElse(() =>
            // see: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Uint8Array/toHex
            array.reduce(
              (accumulator, byte) =>
                accumulator + byte.toString(16).padStart(2, "0"),
              "",
            ),
          ),
        ),
      ),
    ),
  /**
   * Uint8Array as Base58.
   */
  b: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, Predicate.isUint8Array),
      Option.map(base58btc.baseEncode),
    ),
  /**
   * Uint8Array as Base32.
   */
  t: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, Predicate.isUint8Array),
      Option.map(base32.baseEncode),
    ),
  /**
   * Uint8Array as Base64.
   */
  m: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, Predicate.isUint8Array),
      Option.map(base64.baseEncode),
    ),
  /**
   * PeerId.
   */
  p: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, isPeerId),
      Option.map((peerId) => peerId.toString()),
    ),
  /**
   * CID.
   */
  c: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, (_) => _ instanceof CID),
      Option.map((cid) => cid.toString()),
    ),
  // interface-datastore (k) is not supported as it is IPFS only
  /**
   * Multiaddr.
   */
  a: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, isMultiaddr),
      Option.map((addr) => addr.toString()),
    ),
  /**
   * Error.
   */
  // eslint-disable-next-line unicorn/prevent-abbreviations
  e: (value: unknown) =>
    pipe(
      Option.liftPredicate(value, Predicate.isError),
      Option.map((error) =>
        pipe(
          nonEmptyString(error.stack),
          Option.orElse(() => nonEmptyString(error.message)),
          Option.getOrElse(() => error.toString()),
        ),
      ),
    ),
};

/** @internal */
export const defaultFormatters: FormatterCollection = {
  ...debugJsFormatters,
  ...libp2pFormatters,
};
