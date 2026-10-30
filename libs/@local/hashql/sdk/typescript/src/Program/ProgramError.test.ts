import { Option, Result, Schema, SchemaParser } from "effect";
import { describe, expect, test } from "vitest";

import { Construction } from "./ProgramError.js";

const issue = Option.getOrThrow(
  Result.getFailure(SchemaParser.decodeUnknownResult(Schema.String)(42)),
);

describe("construction_factories", () => {
  test("invalid_expression", () => {
    expect.hasAssertions();
    const error = Construction.invalidExpression(issue);
    expect(error).toBeInstanceOf(Construction);
    expect(error.reason).toStrictEqual({
      _tag: "InvalidExpression",
      cause: issue,
    });
    expect(error.cause).toBe(issue);
  });
});
