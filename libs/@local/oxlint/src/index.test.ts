import { describe, expect, test } from "vitest";

import { createConfig } from "./index.js";

describe("createConfig", () => {
  test("strict_defaults", () => {
    expect.hasAssertions();

    const config = createConfig({ runtime: "node" });

    expect(config.categories).toStrictEqual({
      correctness: "deny",
      nursery: "deny",
      pedantic: "deny",
      perf: "deny",
      restriction: "deny",
      style: "deny",
      suspicious: "deny",
    });
    expect(config.options?.typeAware).toBe(true);
    expect(config.rules?.["hash/require-rule-change-comment"]).toBe("deny");
  });

  test("vitest_boolean_matchers", () => {
    expect.hasAssertions();

    const config = createConfig({ runtime: "node", frameworks: ["vitest"] });

    expect(config.rules?.["vitest/prefer-to-be-falsy"]).toBe("off");
    expect(config.rules?.["vitest/prefer-to-be-truthy"]).toBe("off");
  });

  test("ignore_patterns", () => {
    expect.hasAssertions();

    const config = createConfig({
      ignorePatterns: ["generated/**"],
      runtime: "node",
    });

    expect(config.ignorePatterns).toStrictEqual(["generated/**"]);
  });

  test.each(["unknown", "object"])("reserved_type_%s", (typeName) => {
    expect.hasAssertions();

    expect(() =>
      createConfig({
        additionalRestrictedTypes: { [typeName]: "Override" },
        runtime: "node",
      }),
    ).toThrow(`Cannot override the built-in restriction for "${typeName}".`);
  });
});
