import { Effect, Exit, Option } from "effect";
import { describe, expect, test } from "vitest";

import * as Type from "../JExpr/Type/index.js";
import { isStackOverflow, make, makeEffect, makeOption } from "./overflow.js";

/** A tuple nested deeper than any engine's call stack lets Effect validate. */
const deepType = (): Type.Type => {
  let type: Type.Type = Type.infer();
  for (let depth = 0; depth < 100_000; depth += 1) {
    type = Type.tuple(type);
  }
  return type;
};

describe("is_stack_overflow", () => {
  test.each([
    ["range_error", new RangeError("Maximum call stack size exceeded"), true],
    [
      // SpiderMonkey's overflow error, which Node cannot produce.
      "internal_error",
      Object.assign(new Error("too much recursion"), { name: "InternalError" }),
      true,
    ],
    ["type_error", new TypeError("Maximum call stack size exceeded"), false],
    ["thrown_string", "RangeError", false],
  ])("%s", (_, error, expected) => {
    expect.hasAssertions();
    expect(isStackOverflow(error)).toBe(expected);
  });
});

describe("deep_nesting", () => {
  const type = deepType();

  test("make", () => {
    expect.hasAssertions();
    expect(() => make(Type.Schema)(type)).toThrow("Schema validation failed");
  });

  test("make_effect", () => {
    expect.hasAssertions();
    const exit = Effect.runSyncExit(makeEffect(Type.Schema)(type));
    expect(Exit.hasFails(exit)).toBe(true);
    expect(Exit.hasDies(exit)).toBe(false);
  });

  test("make_option", () => {
    expect.hasAssertions();
    expect(Option.isNone(makeOption(Type.Schema)(type))).toBe(true);
  });
});
