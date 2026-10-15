import { Cause, Result, pipe } from "effect";
import { assert, describe, expect, test } from "vitest";

import * as Fixtures from "./fixtures.js";
import * as Draft from "./index.js";

describe("draft_exceptions", () => {
  test.each([new Error("user exception"), "non-error", undefined])(
    "host_exception_%#",
    (thrown) => {
      expect.hasAssertions();
      const result = Draft.program({}, () => {
        // oxlint-disable-next-line typescript/only-throw-error -- unchecked JavaScript callbacks can throw arbitrary values
        throw thrown;
      });
      const failure = pipe(result, Result.flip, Result.getOrThrow);
      assert(failure.reason._tag === "CallbackException");
      expect(failure.reason.cause).toBeInstanceOf(Cause.UnknownError);
      expect(failure.reason.cause.cause).toBe(thrown);
      expect(failure.message).toBe("A program callback threw an exception");
    },
  );

  test("branch_exception", () => {
    expect.hasAssertions();
    const thrown = new Error("branch callback");
    const fail = (): bigint => {
      throw thrown;
    };
    const results = [
      Draft.program({}, ($) => $.if(false, fail, () => 1n)),
      Draft.program({}, ($) => $.if(true, () => 1n, fail)),
    ];
    for (const result of results) {
      expect(result).toMatchObject({
        _tag: "Failure",
        failure: {
          reason: { _tag: "CallbackException", cause: { cause: thrown } },
        },
      });
    }
  });

  test("predicate_exception", () => {
    expect.hasAssertions();
    const thrown = new Error("predicate callback");
    const result = Fixtures.program({ axis: Fixtures.axis }, ($, inputs) =>
      $.query
        .entities(inputs.axis)
        .filter("vertex", (): boolean => {
          throw thrown;
        })
        .collect(),
    );
    expect(result).toMatchObject({
      _tag: "Failure",
      failure: {
        reason: { _tag: "CallbackException", cause: { cause: thrown } },
      },
    });
  });
});
