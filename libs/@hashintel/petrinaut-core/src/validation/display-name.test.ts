import { describe, expect, test } from "vitest";

import { validateDisplayName } from "./display-name";

describe("validateDisplayName", () => {
  test("accepts names with spaces", () => {
    for (const name of [
      "Quality Check",
      "Start Production",
      "My Transition 2",
      "Deliver to Plant",
    ]) {
      const result = validateDisplayName(name);
      expect(result, `expected "${name}" to be valid`).toEqual({
        valid: true,
        name,
      });
    }
  });

  test("accepts PascalCase names", () => {
    expect(validateDisplayName("Collision")).toEqual({
      valid: true,
      name: "Collision",
    });
  });

  test("trims whitespace", () => {
    expect(validateDisplayName("  Hello  ")).toEqual({
      valid: true,
      name: "Hello",
    });
  });

  test("rejects empty string", () => {
    const result = validateDisplayName("");
    expect(result.valid).toBe(false);
  });

  test("rejects whitespace-only string", () => {
    const result = validateDisplayName("   ");
    expect(result.valid).toBe(false);
  });
});
