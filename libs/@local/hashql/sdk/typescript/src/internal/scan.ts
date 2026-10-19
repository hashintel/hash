/**
 * Scans HashQL identifiers and paths while preserving quoted separators.
 *
 * Backtick-quoted identifiers can contain `::`. Each identifier must consume its closing backtick before a path separator can begin.
 *
 * @internal
 */

import { Filter, Option } from "effect";

/** The kinds of identifier, matching `IdentKind` in `hashql-core`. */
export type Kind = "Lexical" | "Symbol" | "BaseUrl";

/** An identifier found in the input, without its backticks. */
export interface ScanIdent {
  readonly kind: Kind;
  readonly value: string;
  /** Index just past the identifier, including any closing backtick. */
  readonly end: number;
}

const backtick = "`";

/** ASCII operator characters, or any non-ASCII punctuation or symbol. */
export const symbolCharacterPattern: string = String.raw`(?:[!#$%&*+./<=>?@\\^|~\[\]-]|(?![\0-\x7F])[\p{P}\p{S}])`;

/** RFC 3986 reserved, unreserved and percent characters (`ALLOWED_URL_CHARS`). */
const urlChar = String.raw`[\w!#$%&'()*+,./:;=?@\[\]~-]`;

/** A Unicode character that can start a lexical identifier. */
export const lexicalStartPattern: string = String.raw`\p{XID_Start}`;

/** A Unicode character that can follow the first character of a lexical identifier. */
export const lexicalContinuePattern: string = String.raw`\p{XID_Continue}`;

/** `XID_Start XID_Continue*`, or `_` followed by at least one `XID_Continue`. */
export const lexicalPattern: string = String.raw`(?:${lexicalStartPattern}${lexicalContinuePattern}*|_${lexicalContinuePattern}+)`;

/** One or more symbol characters. */
export const symbolPattern: string = String.raw`(?:${symbolCharacterPattern}+)`;

/**
 * An HTTP(S) URL-shaped identifier ending in `/`.
 *
 * The first character after `//` must be a non-slash URL character. This checks spelling rather than URL validity.
 */
export const baseUrlPattern: string = String.raw`(?:https?://${urlChar.replace("/", "")}${urlChar}*/)`;

const lexical = new RegExp(lexicalPattern, "uy");
const symbol = new RegExp(symbolPattern, "uy");
const escapedSymbol = new RegExp(
  `${backtick}(${symbolPattern})${backtick}`,
  "uy",
);
const escapedBaseUrl = new RegExp(
  `${backtick}(${baseUrlPattern})${backtick}`,
  "uy",
);

/** `ws("::")` from the backend: a separator with optional surrounding whitespace. */
const separator = /[\t\n\r ]*::[\t\n\r ]*/uy;

/** A leading `::` marking a rooted path, with optional trailing whitespace. */
const root = /::[\t\n\r ]*/uy;

const matchAtRaw = (
  expression: RegExp,
  input: string,
  start: number,
): Option.Option<RegExpExecArray> => {
  expression.lastIndex = start;
  return Option.fromNullishOr(expression.exec(input));
};

const matchAt =
  (
    expression: RegExp,
    input: string,
    start: number,
  ): ((kind: Kind, group: 0 | 1) => Option.Option<ScanIdent>) =>
  (kind: Kind, group: 0 | 1): Option.Option<ScanIdent> =>
    Option.filterMap(
      matchAtRaw(expression, input, start),
      Filter.fromPredicateOption((match) =>
        Option.fromNullishOr(match[group]).pipe(
          Option.map((value) => ({
            kind,
            value,
            end: match.index + match[0].length,
          })),
        ),
      ),
    );

const scanIdent = (input: string, start: number): Option.Option<ScanIdent> => {
  if (input.startsWith(backtick, start)) {
    return Option.orElse(
      matchAt(escapedSymbol, input, start)("Symbol", 1),
      () => matchAt(escapedBaseUrl, input, start)("BaseUrl", 1),
    );
  }

  return Option.orElse(matchAt(lexical, input, start)("Lexical", 0), () =>
    matchAt(symbol, input, start)("Symbol", 0),
  );
};

export const scanIdentExact = (input: string): Option.Option<ScanIdent> =>
  scanIdent(input, 0).pipe(
    Option.filter((ident) => ident.end === input.length),
  );

/** A path split into its parts. */
interface ScanPath {
  readonly rooted: boolean;
  readonly segments: readonly [ScanIdent, ...ScanIdent[]];
}

/**
 * Splits `input` into an optional leading `::` and `::`-separated identifiers.
 *
 * Whitespace is allowed around separators, as in the backend. Leading and
 * trailing whitespace, empty segments and per-segment generic arguments are
 * rejected.
 */
export const scanPath = (input: string): Option.Option<ScanPath> => {
  const rootMatch = matchAtRaw(root, input, 0);
  const first = scanIdent(input, rootMatch.valueOrUndefined?.[0].length ?? 0);

  if (Option.isNone(first)) {
    return Option.none();
  }

  const segments: [ScanIdent, ...ScanIdent[]] = [first.value];
  let position = first.value.end;

  while (position < input.length) {
    const next = matchAtRaw(separator, input, position);

    if (Option.isNone(next)) {
      return Option.none();
    }

    const segment = scanIdent(input, next.value.index + next.value[0].length);

    if (Option.isNone(segment)) {
      return Option.none();
    }

    segments.push(segment.value);
    position = segment.value.end;
  }

  return Option.some({ rooted: rootMatch._tag === "Some", segments });
};
