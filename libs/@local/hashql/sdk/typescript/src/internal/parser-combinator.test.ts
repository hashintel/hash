import { Arbitrary, Effect, Option, Result, pipe } from "effect";
import { describe, expect, test } from "vitest";

import { cut, repeat, separated, skip, suspend } from "./parser-combinator.js";
import {
  ExpectedLiteral,
  ExpectedProgress,
  ParserError,
} from "./parser-error.js";
import * as Parser from "./parser.js";

const token = (text: string): Parser.Parser<string, ExpectedLiteral> =>
  pipe(
    Parser.make(),
    Parser.literal(text),
    Parser.map(([, value]) => value),
  );

describe("grammar_combinators", () => {
  test("committed_choice", () => {
    expect.hasAssertions();
    const selected = pipe(token("a"), skip(cut(token("b"))));
    expect(Parser.choice(selected, token("ac")).parse("ac")).toStrictEqual(
      Result.fail(
        ParserError.at(1, ExpectedLiteral({ literal: "b" })).commit(),
      ),
    );
  });

  test("committed_optional", () => {
    expect.hasAssertions();
    const committed = pipe(token("a"), skip(cut(token("b"))), Parser.optional);
    expect(Result.isFailure(committed.parse("ac"))).toBe(true);
    expect(committed.parse("x")).toStrictEqual(
      Result.succeed({ input: "x", output: Option.none() }),
    );
  });

  test("repeat_progress", () => {
    expect.hasAssertions();
    expect(repeat(Parser.make(1)).parse("input")).toStrictEqual(
      Result.fail(ParserError.at(0, ExpectedProgress()).commit()),
    );
  });

  test("separated_rollback", () => {
    expect.hasAssertions();
    const list = separated(token(","))(token("x"));
    expect(list.parse("x,x,")).toStrictEqual(
      Result.succeed({ input: ",", output: ["x", "x"] }),
    );
    expect(Result.isFailure(Parser.eof(list).parse("x,x,"))).toBe(true);
  });

  test("recursive_generation", () => {
    expect.hasAssertions();
    const leaf = token("x");
    const recursive: Parser.Parser<string, ExpectedLiteral> = suspend(() =>
      Parser.choice(
        leaf,
        pipe(
          token("("),
          Parser.and(recursive),
          Parser.literal(")"),
          Parser.map(([[, value]]) => value),
        ),
      ),
    );
    const source = recursive.source();
    expect(recursive.source()).toBe(source);
    const samples = Effect.runSync(
      Arbitrary.sampleEffect(recursive.arbitrary(), {
        count: 100,
        size: 30,
        seed: 42,
      }),
    );
    expect(samples.some((sample) => sample.source.includes("(((("))).toBe(true);
    for (const sample of samples) {
      expect(sample.output).toBe("x");
      expect(recursive.parse(sample.source)).toStrictEqual(
        Result.succeed({ input: "", output: "x" }),
      );
    }
  });
});
