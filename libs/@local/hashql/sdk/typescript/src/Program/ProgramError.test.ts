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

  test("invalid_export_name", () => {
    expect.hasAssertions();
    const error = Construction.invalidExportName("not an identifier", issue);
    expect(error).toBeInstanceOf(Construction);
    expect(error.reason).toStrictEqual({
      _tag: "InvalidExportName",
      name: "not an identifier",
      cause: issue,
    });
    expect(error.cause).toBe(issue);
  });

  test("invalid_module_path", () => {
    expect.hasAssertions();
    const error = Construction.invalidModulePath("::", issue);
    expect(error).toBeInstanceOf(Construction);
    expect(error.reason).toStrictEqual({
      _tag: "InvalidModulePath",
      path: "::",
      cause: issue,
    });
    expect(error.cause).toBe(issue);
  });

  test("relative_module_path", () => {
    expect.hasAssertions();
    const error = Construction.relativeModulePath("core::math");
    expect(error).toBeInstanceOf(Construction);
    expect(error.reason).toStrictEqual({
      _tag: "RelativeModulePath",
      path: "core::math",
    });
    expect(error.cause).toBeUndefined();
  });
});
