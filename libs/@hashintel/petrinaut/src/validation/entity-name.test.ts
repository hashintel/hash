import { describe, expect, test } from "vitest";

import { validateEntityName } from "./entity-name";

describe("validateEntityName", () => {
  test("accepts valid PascalCase names", () => {
    for (const name of [
      "Place",
      "MyPlace",
      "HTTPServer",
      "A",
      "Place1",
      "MyPlace42",
      "Transition",
    ]) {
      const result = validateEntityName(name);
      expect(result, `expected "${name}" to be valid`).toEqual({
        valid: true,
        name,
      });
    }
  });

  test("trims whitespace and accepts if otherwise valid", () => {
    expect(validateEntityName("  Place  ")).toEqual({
      valid: true,
      name: "Place",
    });
  });

  test("rejects empty string", () => {
    const result = validateEntityName("");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("empty");
    }
  });

  test("rejects whitespace-only string", () => {
    const result = validateEntityName("   ");
    expect(result.valid).toBe(false);
  });

  test("rejects lowercase start", () => {
    const result = validateEntityName("place");
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.error).toContain("PascalCase");
    }
  });

  test("rejects names with spaces", () => {
    const result = validateEntityName("My Place");
    expect(result.valid).toBe(false);
  });

  test("rejects names with underscores", () => {
    const result = validateEntityName("My_Place");
    expect(result.valid).toBe(false);
  });

  test("rejects names starting with a number", () => {
    const result = validateEntityName("1Place");
    expect(result.valid).toBe(false);
  });

  test("rejects names with numbers in the middle", () => {
    const result = validateEntityName("Place1Name");
    expect(result.valid).toBe(false);
  });
});
