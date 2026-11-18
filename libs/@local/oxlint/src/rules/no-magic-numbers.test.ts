import { RuleTester } from "oxlint/plugins-dev";

import { noMagicNumbers } from "./no-magic-numbers.js";

const tester = new RuleTester({
  languageOptions: { parserOptions: { lang: "tsx" } },
});

const rejects = (
  code: string,
  ...findings: readonly [expression: string, messageId: string][]
): RuleTester.InvalidTestCase => ({
  code,
  errors: findings.map(([expression, messageId]) => {
    const offset = code.indexOf(expression);
    if (offset === -1 || offset !== code.lastIndexOf(expression)) {
      throw new Error(`Expected a unique diagnostic span: ${expression}`);
    }
    const before = code.slice(0, offset);
    const through = code.slice(0, offset + expression.length);
    return {
      messageId,
      line: before.split("\n").length,
      column: before.length - before.lastIndexOf("\n") - 1,
      endLine: through.split("\n").length,
      endColumn: through.length - through.lastIndexOf("\n") - 1,
    };
  }),
  output: null,
});

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("no-magic-numbers", noMagicNumbers, {
  invalid: [
    rejects("const total = price * 1.2;", ["1.2", "magicNumber"]),
    rejects(
      "setTimeout(refresh, 60 * 1000);",
      ["60", "magicNumber"],
      ["1000", "magicNumber"],
    ),
    rejects("const WEEK = SECONDS_PER_DAY * 7;", ["7", "magicNumber"]),
    rejects(
      "const elapsed = 60 * offset * 24;",
      ["60", "magicNumber"],
      ["24", "magicNumber"],
    ),
    rejects("const delay = -offset * 60;", ["60", "magicNumber"]),
    rejects(
      "const EXCEEDED = 60 * 24 > 1000;",
      ["60", "magicNumber"],
      ["24", "magicNumber"],
      ["1000", "magicNumber"],
    ),
    rejects(
      "const hours = (60 * 24) as Hours;",
      ["60", "magicNumber"],
      ["24", "magicNumber"],
    ),
    rejects("const limit = 100 as Limit;", ["100", "magicNumber"]),
    rejects("let limit = 100;", ["100", "mutableName"]),
    rejects("var limit = -100;", ["-100", "mutableName"]),
    rejects("let window = 60 * 60;", ["60 * 60", "mutableName"]),
    rejects("for (let index = 3; index < limit; index += 1) {}", [
      "3",
      "mutableName",
    ]),
    rejects("limit = 100;", ["100", "magicNumber"]),
    rejects("limit += 100;", ["100", "magicNumber"]),
    rejects(
      "const values = [3, 5];",
      ["3", "magicNumber"],
      ["5", "magicNumber"],
    ),
    rejects(
      // oxlint-disable-next-line no-template-curly-in-string -- The source under test must retain its template interpolation.
      "const label = `${42}`;",
      ["42", "magicNumber"],
    ),
    rejects("const { 3: third } = values;", ["3", "magicNumber"]),
    rejects("function scale(factor: 3) {}", ["3", "magicNumber"]),
    rejects("interface Limits { maximum: 100 }", ["100", "magicNumber"]),
    rejects("class Box { accessor width = 640; }", ["640", "magicNumber"]),
    rejects("const total = 5n * amount;", ["5n", "magicNumber"]),
    rejects("const total = 3n + amount;", ["3n", "magicNumber"]),
    rejects("const total = amount * 1.5;", ["1.5", "magicNumber"]),
  ],
  valid: [
    "const SECONDS_PER_DAY = 60 * 60 * 24;",
    "const MEBIBYTE = 2 ** 20;",
    "const FLAGS = (1 << 4) | (1 << 8);",
    "const OFFSET = -(60 * 60);",
    "const OFFSET = 60 * -5;",
    "const LIMIT = 10n ** 6n;",
    "const TIMEOUT = 30_000;",
    "const NEGATIVE = -42;",
    "const POSITIVE = +42;",
    "const HALF = TIMEOUT / 2;",
    "const next = amount + 1n;",
    "const previous = amount - 2n;",
    "const last = items[items.length - 1];",
    "function connect(timeout = 30_000) {}",
    "function connect(timeout = 60 * 1000) {}",
    "const { tax = 0.25 } = accountancy;",
    "({ tax = 0.25 } = accountancy);",
    "const retry = { attempts: 3, backoff: 1.5 };",
    "const retry = { delay: 60 * 1000 };",
    "class Retry { attempts = 3; static backoff = 1.5; #limit = 4; }",
    "class Retry { readonly attempts = 3; }",
    "class Retry { constructor(private readonly attempts = 3) {} }",
    "enum Duration { Second = 1000, Minute = 60 * 1000 }",
    "type Prime = 3 | 5 | 7;",
    "type Offset = -3;",
    "type Third = Values[3];",
    "type Element = Values[3 | 4];",
    "const parsed = parseInt(input, 16);",
    "const parsed = Number.parseInt(input, 16);",
    "target.width = 640;",
    "const view = <Box width={640} />;",
  ],
});
