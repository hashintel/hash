/**
 * Character membership and constructive generation from one Unicode pattern.
 *
 * {@link xidStart} and {@link xidContinue} use the JavaScript runtime's Unicode tables. Construction caches ASCII membership from the same pattern used for Unicode matching. Their first arbitrary derivation enumerates scalar values to obtain explicit ranges supported by Effect. Later derivations reuse the result. Parsing does not enumerate Unicode.
 *
 * @internal
 */
import { Arbitrary, Schema } from "effect";
import { memoize } from "effect/Function";

import {
  exactly,
  characterClass as rangesFor,
  sourceText,
} from "./schema-arbitrary.js";

/**
 * Membership in a set of individual Unicode scalar values.
 *
 * Implementations supply pure callbacks and keep their membership test, pattern and arbitrary consistent. The pattern describes membership in Unicode mode. {@link characterClass} constructs this relationship. Structural assignability alone does not validate it.
 */
export interface CharacterClass {
  /** Diagnostic label. The pattern distinguishes classes that share a label. */
  readonly name: string;
  /** The Unicode-mode pattern, restricted to one scalar by the class. */
  readonly pattern: string;
  /** Rejects empty strings, multiple scalars and isolated surrogates. */
  readonly test: (character: string) => boolean;
  /** Describes members for composition into recursive source generators. */
  readonly schema: () => Schema.Codec<string>;
  /** Generates members, including the class's non-ASCII members. */
  readonly arbitrary: () => Arbitrary.Arbitrary<string>;
}

const scalarPattern = String.raw`[^\uD800-\uDFFF]`;
const endPattern = String.raw`(?![\s\S])`;
const scalarExpression = new RegExp(`^${scalarPattern}${endPattern}`, "u");

/** Builds an ASCII lookup and retains regex matching for other inputs. */
const membership = (
  expression: Readonly<RegExp>,
): ((character: string) => boolean) => {
  const ascii = Uint8Array.from({ length: 0x80 }, (_value, codePoint) =>
    Number(expression.test(String.fromCodePoint(codePoint))),
  );

  return (character) => {
    if (character.length === 1) {
      const codePoint = character.codePointAt(0);
      if (codePoint !== undefined && codePoint < ascii.length) {
        return ascii[codePoint] === 1;
      }
    }

    return expression.test(character);
  };
};

const surrogateStart = 0xd8_00;
const surrogateCount = 0x08_00;
const maximumScalar = 0x10_ff_ff;

const scalarSchema = sourceText(
  Schema.Int.check(
    Schema.isBetween({ minimum: 0, maximum: maximumScalar - surrogateCount }),
  ),
  (index) => {
    if (index < surrogateStart) {
      return String.fromCodePoint(index);
    }

    return String.fromCodePoint(index + surrogateCount);
  },
);
const scalarArbitrary = Arbitrary.schema(scalarSchema);

/**
 * All Unicode scalar values, including controls and noncharacters.
 *
 * Generation excludes surrogates without scanning Unicode or discarding candidates.
 *
 * @example <caption>Sample complete Unicode characters in a Node.js host.</caption>
 * ```ts
 * import assert from "node:assert/strict";
 * import { Arbitrary, Array, Effect } from "effect";
 * import { unicodeScalar } from "./character-class.js";
 *
 * const characters = await Effect.runPromise(
 *   Arbitrary.sampleEffect(unicodeScalar.arbitrary(), { count: 8, seed: 42 }),
 * );
 * for (const character of characters) {
 *   assert.equal(Array.fromIterable(character).length, 1);
 *   assert.ok(character.isWellFormed());
 * }
 * ```
 */
export const unicodeScalar: CharacterClass = {
  name: "UnicodeScalar",
  pattern: scalarPattern,
  test: membership(scalarExpression),
  schema: () => scalarSchema,
  arbitrary: () => scalarArbitrary,
};

/** Compiles and caches explicit ranges for one pattern's arbitrary. */
const derive = memoize((expression: Readonly<RegExp>) => {
  const schema = exactly(expression.source, () => rangesFor(expression));
  return { schema, arbitrary: Arbitrary.schema(schema) };
});

/**
 * Defines a named class from a Unicode-mode regular-expression source.
 *
 * Membership requires exactly one scalar to match the whole pattern. First derivation scans the runtime's Unicode range and caches the resulting arbitrary. An empty class constructs successfully, but sampling it exhausts Effect's discard budget.
 *
 * @throws {SyntaxError} If the regular-expression source is invalid.
 */
export const characterClass = ({
  name,
  pattern,
}: {
  readonly name: string;
  readonly pattern: string;
}): CharacterClass => {
  const compiled = new RegExp(pattern, "u");
  const expression = new RegExp(
    `^(?=${scalarPattern}${endPattern})(?:${compiled.source})${endPattern}`,
    "u",
  );

  return {
    name,
    pattern,
    test: membership(expression),
    schema: () => derive(expression).schema,
    arbitrary: () => derive(expression).arbitrary,
  };
};

/** A Unicode identifier-start character. Underscore is not a member. */
export const xidStart: CharacterClass = characterClass({
  name: "XID_Start",
  pattern: "\\p{XID_Start}",
});

/** A Unicode identifier continuation, including digits and underscore. */
export const xidContinue: CharacterClass = characterClass({
  name: "XID_Continue",
  pattern: "\\p{XID_Continue}",
});
