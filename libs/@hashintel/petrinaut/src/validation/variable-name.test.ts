import { describe, expect, test } from "vitest";

import { validateVariableName } from "./variable-name";

describe("validateVariableName", () => {
  test("accepts valid lower_snake_case names", () => {
    for (const name of [
      "crash_threshold",
      "dt",
      "param1",
      "max_retries_2",
      "a",
      "x0",
      "my_long_variable_name",
    ]) {
      const result = validateVariableName(name);
      expect(result, `expected "${name}" to be valid`).toEqual({
        valid: true,
        name,
      });
    }
  });

  test("trims whitespace and accepts if otherwise valid", () => {
    expect(validateVariableName("  dt  ")).toEqual({
      valid: true,
      name: "dt",
    });
  });

  test("rejects empty string", () => {
    const result = validateVariableName("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("empty");
    }
  });

  test("rejects whitespace-only string", () => {
    const result = validateVariableName("   ");
    expect(result.valid).toBe(false);
  });

  test("rejects uppercase letters", () => {
    const result = validateVariableName("CrashThreshold");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("lower_snake_case");
    }
  });

  test("rejects leading underscore", () => {
    const result = validateVariableName("_private");
    expect(result.valid).toBe(false);
  });

  test("rejects trailing underscore", () => {
    const result = validateVariableName("param_");
    expect(result.valid).toBe(false);
  });

  test("rejects double underscores", () => {
    const result = validateVariableName("crash__threshold");
    expect(result.valid).toBe(false);
  });

  test("rejects names starting with a digit", () => {
    const result = validateVariableName("1param");
    expect(result.valid).toBe(false);
  });

  test("rejects spaces", () => {
    const result = validateVariableName("crash threshold");
    expect(result.valid).toBe(false);
  });

  test("rejects hyphens", () => {
    const result = validateVariableName("crash-threshold");
    expect(result.valid).toBe(false);
  });
});
