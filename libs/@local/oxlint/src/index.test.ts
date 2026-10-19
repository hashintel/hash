import { describe, expect, test } from "vitest";

import { defineConfig } from "./index.js";

describe("defineConfig", () => {
  test("strict_defaults", () => {
    expect.hasAssertions();

    const config = defineConfig({ runtime: "node" });

    expect(config.extends?.[0]?.categories).toStrictEqual({
      correctness: "deny",
      nursery: "deny",
      pedantic: "deny",
      perf: "deny",
      restriction: "deny",
      style: "deny",
      suspicious: "deny",
    });
    expect(config.extends?.[0]?.options?.typeAware).toBe(true);
    expect(config.extends?.[0]?.options?.reportUnusedDisableDirectives).toBe(
      "error",
    );
    expect(config.extends?.[0]?.rules?.["hash/prefer-rust-severities"]).toBe(
      "deny",
    );
    expect(
      config.extends?.[0]?.rules?.["hash/require-rule-change-comment"],
    ).toBe("deny");
  });

  test("vitest_boolean_matchers", () => {
    expect.hasAssertions();

    const config = defineConfig({ runtime: "node", frameworks: ["vitest"] });

    expect(config.extends?.[0]?.rules?.["vitest/prefer-to-be-falsy"]).toBe(
      "allow",
    );
    expect(config.extends?.[0]?.rules?.["vitest/prefer-to-be-truthy"]).toBe(
      "allow",
    );
  });

  test("vitest_effect_tests", () => {
    expect.hasAssertions();

    const effect = defineConfig({
      runtime: "node",
      frameworks: ["vitest", "effect"],
    });
    const plain = defineConfig({ runtime: "node", frameworks: ["vitest"] });

    expect(
      effect.extends?.[0]?.rules?.["vitest/no-standalone-expect"],
    ).toStrictEqual([
      "deny",
      {
        additionalTestBlockFunctions: [
          "it",
          "it.effect",
          "it.effect.skip",
          "it.effect.only",
          "it.effect.each",
          "it.live",
          "it.live.skip",
          "it.live.only",
          "it.live.each",
        ],
      },
    ]);
    expect(effect.extends?.[0]?.rules?.["vitest/require-hook"]).toStrictEqual([
      "deny",
      { allowedFunctionCalls: ["layer"] },
    ]);
    expect(
      plain.extends?.[0]?.rules?.["vitest/no-standalone-expect"],
    ).toBeUndefined();
    expect(plain.extends?.[0]?.rules?.["vitest/require-hook"]).toBeUndefined();
  });

  test("ignore_patterns", () => {
    expect.hasAssertions();

    const config = defineConfig({
      ignorePatterns: ["generated/**"],
      runtime: "node",
    });

    expect(config.ignorePatterns).toStrictEqual(["generated/**"]);
  });

  test("next_ignore_patterns", () => {
    expect.hasAssertions();

    const config = defineConfig({
      frameworks: ["next"],
      ignorePatterns: ["generated/**"],
      runtime: "node",
    });

    expect(config.ignorePatterns).toStrictEqual([
      ".next/**",
      "next-env.d.ts",
      "generated/**",
    ]);
  });

  test.each(["unknown", "object"])("reserved_type_%s", (typeName) => {
    expect.hasAssertions();

    expect(() =>
      defineConfig({
        additionalRestrictedTypes: { [typeName]: "Override" },
        runtime: "node",
      }),
    ).toThrow(`Cannot override the built-in restriction for "${typeName}".`);
  });
});
