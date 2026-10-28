/**
 * Constructive arbitrary generation for schema string patterns.
 *
 * Effect's arbitrary compiler requires explicit character ranges for Unicode properties and lookarounds. Generation hints supply those ranges. Schema validation retains the original pattern.
 *
 * @internal
 */
import { Predicate, Schema, SchemaGetter } from "effect";
import { dual, memoize } from "effect/Function";

/** Maps a generated representation to text while retaining its recursive schema structure. */
export const sourceText: {
  <T>(
    render: (value: T) => string,
  ): (schema: Schema.Schema<T>) => Schema.Codec<string>;
  <T>(
    schema: Schema.Schema<T>,
    render: (value: T) => string,
  ): Schema.Codec<string>;
} = dual(
  2,
  <T>(
    schema: Schema.Schema<T>,
    render: (value: T) => string,
  ): Schema.Codec<string> =>
    Schema.declare(Predicate.isString, {
      toCodecArbitrary: () =>
        Schema.link<string>()(schema, {
          decode: SchemaGetter.transform(render),
          encode: SchemaGetter.forbiddenEncoding,
        }),
    }),
);

/** Shares Effect's recursive size allowance across repeated source fragments. */
export const repeatSource = (
  item: Schema.Codec<string>,
): Schema.Codec<string> => {
  const sequence: Schema.Codec<string> = Schema.suspend(() =>
    Schema.Union([
      Schema.Literal(""),
      sourceText(
        Schema.Tuple([item, sequence]),
        ([first, rest]) => first + rest,
      ),
    ]),
  );
  return sequence;
};

/** Expands a character pattern into Unicode ranges for arbitrary generation. */
export const characterClass: (pattern: Readonly<RegExp>) => string = memoize(
  (pattern): string => {
    const maximumCodePoint = 1_114_111;
    const hexadecimalRadix = 16;
    const ranges: string[] = [];
    let start: number | undefined = undefined;

    // include a sentinel after the final code point to close any remaining range
    for (let codePoint = 0; codePoint <= maximumCodePoint + 1; codePoint += 1) {
      if (
        codePoint <= maximumCodePoint &&
        pattern.test(String.fromCodePoint(codePoint))
      ) {
        start ??= codePoint;
      } else if (start !== undefined) {
        const first = `\\u{${start.toString(hexadecimalRadix)}}`;
        if (start === codePoint - 1) {
          ranges.push(first);
        } else {
          const last = `\\u{${(codePoint - 1).toString(hexadecimalRadix)}}`;
          ranges.push(`${first}-${last}`);
        }

        start = undefined;
      }
    }

    return `[${ranges.join("")}]`;
  },
);

/** Requires the entire value to match a pattern, with separate generation hints. */
export const exactly: {
  (generatePattern?: () => string): (pattern: string) => Schema.String;
  (pattern: string, generatePattern?: () => string): Schema.String;
} = dual(
  (args) => typeof args[0] === "string",
  (
    pattern: string,
    generatePattern: () => string = () => pattern,
  ): Schema.String =>
    Schema.String.check(
      // `$` also matches before a final line terminator. The lookahead requires end of input.
      Schema.isPattern(new RegExp(`^(?:${pattern})(?![\\s\\S])`, "u"), {
        arbitraryConstraint: {
          // expansion runs only during arbitrary derivation, using the same Unicode tables as validation
          get patterns(): readonly [Schema.Annotations.ToArbitrary.Pattern] {
            return [{ source: `^(?:${generatePattern()})$`, flags: "u" }];
          },
        },
      }),
    ),
);
