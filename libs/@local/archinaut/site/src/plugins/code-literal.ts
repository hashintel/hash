/**
 * A value as a literal in generated module source: its JSON, with the
 * characters that could end a string or a script element early escaped.
 * The decks module and the export's entry write deck names, titles and
 * paths into code with it.
 */

const escapes: Record<string, string> = {
  "<": "\\u003C",
  ">": "\\u003E",
  "\b": "\\b",
  "\f": "\\f",
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\0": "\\0",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export const codeLiteral = (value: unknown): string =>
  JSON.stringify(value).replace(
    /[<>\b\f\n\r\t\0\u2028\u2029]/gu,
    (character) => escapes[character] ?? character,
  );
