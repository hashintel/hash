import { Arbitrary, Effect, HashSet, Result, flow, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { xidContinue, xidStart } from "../src/internal/character-class.js";
import {
  ExpectedEndOfInput,
  ExpectedScalar,
  InsufficientLength,
  ParserError,
} from "../src/internal/parser-error.js";
import {
  charIn,
  eof,
  make,
  map,
  nextChar,
  nextSlice,
  takeWhile,
} from "../src/internal/parser.js";

import type { Reason } from "../src/internal/parser-error.js";
import type { Return } from "../src/internal/parser.js";

const surrogateStart = 0xd8_00;
const surrogateEnd = 0xe0_00;
const astralStart = 0x01_00_00;
const scalarCount = 4;
const repetitions = 128;
const options = { time: 250, warmupTime: 100 };

/** A handwritten reference for sequential single-scalar reads followed by EOF. */
const direct =
  (
    length: number,
  ): ((
    input: string,
  ) => Return<
    string,
    ExpectedScalar | InsufficientLength | ExpectedEndOfInput
  >) =>
  (input) => {
    let end = 0;
    for (let count = 0; count < length; count += 1) {
      const codePoint = input.codePointAt(end);
      if (codePoint === undefined) {
        return Result.fail(
          ParserError.at(end, InsufficientLength({ minimum: 1, actual: 0 })),
        );
      }
      if (codePoint >= surrogateStart && codePoint < surrogateEnd) {
        return Result.fail(ParserError.at(end, ExpectedScalar()));
      }
      end += codePoint < astralStart ? 1 : 2;
    }
    if (end < input.length) {
      return Result.fail(ParserError.at(end, ExpectedEndOfInput()));
    }
    return Result.succeed({ input: "", output: input });
  };

/** Batches calls above timer resolution and consumes their results. */
const consume = <R extends Reason>(
  parse: (input: string) => Return<string, R>,
  inputs: readonly string[],
): number => {
  let checksum = 0;
  for (let iteration = 0; iteration < repetitions; iteration += 1) {
    for (const input of inputs) {
      const result = parse(input);
      if (Result.isSuccess(result)) {
        checksum += result.success.output.length;
      } else {
        checksum += HashSet.size(result.failure.expected);
      }
    }
  }
  return checksum;
};

const fourSingles = flow(
  nextChar,
  nextChar,
  nextChar,
  nextChar,
  map(
    ([[[[, first], second], third], fourth]) => first + second + third + fourth,
  ),
  eof,
)(make());
const fourAtOnce = pipe(
  make(),
  nextSlice(scalarCount),
  map(([, value]) => value),
  eof,
);
const oneCharacter = pipe(
  make(),
  nextChar,
  map(([, value]) => value),
  eof,
);

const identifier = flow(
  charIn(xidStart),
  takeWhile(xidContinue),
  map(([[, first], rest]) => first + rest),
  eof,
)(make());

describe.each([
  {
    name: "ascii",
    scalars: ["abcd", "hash", "1234", "\u0000\n!?"],
    identifiers: ["alpha", "helloWorld42", "Identifier_2", "a"],
  },
  {
    name: "unicode",
    scalars: ["éΩaß", "😀λ中x", "𐐀é中Ω", "\uD7FF\uE000\u{10000}\u{10FFFF}"],
    identifiers: ["é", "中Δ𐐀", "𐐀x", "℘name_2"],
  },
])("parsers: $name", ({ scalars, identifiers }) => {
  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this callback and awaits the benchmark engine.
  test("parsing", async ({ bench }) => {
    expect.hasAssertions();
    const baseline = direct(scalarCount);
    for (const input of scalars) {
      expect(fourAtOnce.parse(input)).toStrictEqual(baseline(input));
      expect(fourSingles.parse(input)).toStrictEqual(baseline(input));
    }
    for (const input of identifiers) {
      expect(identifier.parse(input)).toStrictEqual(
        Result.succeed({ input: "", output: input }),
      );
    }
    let checksum = 0;
    const batch = scalars.length * repetitions;
    await bench.compare(
      bench(`nextSlice(4) / ${batch} inputs`, () => {
        checksum += consume(fourAtOnce.parse, scalars);
      }),
      bench(`four nextChar / ${batch} inputs`, () => {
        checksum += consume(fourSingles.parse, scalars);
      }),
      bench(`identifier / ${batch} inputs`, () => {
        checksum += consume(identifier.parse, identifiers);
      }),
      options,
    );
    expect(checksum).toBeGreaterThan(0);
  });
});

describe("parser_benchmarks", () => {
  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous benchmark callback and awaits the measurement engine.
  test("four_scalars", async ({ bench }) => {
    expect.hasAssertions();
    const inputs = ["abcd", "hash", "éΩaß", "😀λ中x"];
    const baseline = direct(scalarCount);
    for (const input of inputs) {
      expect(fourSingles.parse(input)).toStrictEqual(baseline(input));
      expect(fourAtOnce.parse(input)).toStrictEqual(baseline(input));
    }
    let checksum = 0;
    const batch = inputs.length * repetitions;
    await bench.compare(
      bench(`handwritten / ${batch} inputs`, () => {
        checksum += consume(baseline, inputs);
      }),
      bench(`four nextChar / ${batch} inputs`, () => {
        checksum += consume(fourSingles.parse, inputs);
      }),
      bench(`nextSlice(4) / ${batch} inputs`, () => {
        checksum += consume(fourAtOnce.parse, inputs);
      }),
      options,
    );
    expect(checksum).toBeGreaterThan(0);
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous benchmark callback and awaits the measurement engine.
  test("invalid_scalar", async ({ bench }) => {
    expect.hasAssertions();
    const inputs = ["", "\uD800", "\uDFFF"];
    const baseline = direct(1);
    for (const input of inputs) {
      expect(oneCharacter.parse(input)).toStrictEqual(baseline(input));
    }
    let checksum = 0;
    const batch = inputs.length * repetitions;
    await bench.compare(
      bench(`handwritten / ${batch} inputs`, () => {
        checksum += consume(baseline, inputs);
      }),
      bench(`nextChar / ${batch} inputs`, () => {
        checksum += consume(oneCharacter.parse, inputs);
      }),
      options,
    );
    expect(checksum).toBeGreaterThan(0);
  });

  // oxlint-disable-next-line effecttsgo/async-function -- Vitest owns this asynchronous benchmark callback and awaits Effect's sampling runtime.
  test("generation", async ({ bench }) => {
    expect.hasAssertions();
    const arbitrary = fourSingles.arbitrary();
    const samples = Arbitrary.sampleEffect(arbitrary, { count: 100, seed: 42 });
    const examples = await Effect.runPromise(samples);
    for (const example of examples) {
      expect(fourSingles.parse(example.source)).toStrictEqual(
        Result.succeed({ input: "", output: example.output }),
      );
    }
    let checksum = 0;
    // oxlint-disable-next-line effecttsgo/async-function -- The benchmark engine owns this callback. Sampling can yield to Effect's scheduler.
    await bench("100 accepted four-scalar examples", async () => {
      const generated = await Effect.runPromise(samples);
      checksum += generated.length;
    }).run(options);
    expect(checksum).toBeGreaterThan(0);
  });
});
