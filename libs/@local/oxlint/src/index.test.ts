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
    expect(config.options?.reportUnusedDisableDirectives).toBe("error");
    expect(config.rules?.["hash/prefer-rust-severities"]).toBe("deny");
    expect(config.rules?.["hash/require-rule-change-comment"]).toBe("deny");
  });

  test("vitest_boolean_matchers", () => {
    expect.hasAssertions();

    const config = createConfig({ runtime: "node", frameworks: ["vitest"] });

    expect(config.rules?.["vitest/prefer-to-be-falsy"]).toBe("allow");
    expect(config.rules?.["vitest/prefer-to-be-truthy"]).toBe("allow");
  });

  test("vitest_effect_tests", () => {
    expect.hasAssertions();

    const effect = createConfig({
      runtime: "node",
      frameworks: ["vitest", "effect"],
    });
    const plain = createConfig({ runtime: "node", frameworks: ["vitest"] });

    expect(effect.rules?.["vitest/no-standalone-expect"]).toStrictEqual([
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
    expect(effect.rules?.["vitest/require-hook"]).toStrictEqual([
      "deny",
      { allowedFunctionCalls: ["layer"] },
    ]);
    expect(plain.rules?.["vitest/no-standalone-expect"]).toBeUndefined();
    expect(plain.rules?.["vitest/require-hook"]).toBeUndefined();
  });

  test("ignore_patterns", () => {
    expect.hasAssertions();

    const config = createConfig({
      ignorePatterns: ["generated/**"],
      runtime: "node",
    });

    expect(config.ignorePatterns).toStrictEqual(["generated/**"]);
  });

  test("next_ignore_patterns", () => {
    expect.hasAssertions();

    const config = createConfig({
      frameworks: ["next"],
      ignorePatterns: ["generated/**"],
      runtime: "node",
    });

    expect(config.ignorePatterns).toStrictEqual([
      "generated/**",
      ".next/**",
      "next-env.d.ts",
    ]);
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
