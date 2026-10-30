import { describe, expect, test } from "vitest";

import { inheritConfig } from "./inherit-config.js";

import type { OxlintConfig } from "oxlint";

describe("inheritConfig", () => {
  test("inherited_fields", () => {
    expect.hasAssertions();

    const parent: OxlintConfig = {
      env: { node: true },
      globals: { shared: "readonly", parentOnly: "readonly" },
      settings: { react: { version: "18.2" }, custom: { values: [1, 2] } },
      ignorePatterns: ["generated/**"],
    };
    const config = inheritConfig({
      extends: [
        { extends: [parent], env: { browser: true } },
        { env: { node: false }, globals: { shared: "writable" } },
      ],
      env: { browser: false },
      globals: { shared: "off" },
      settings: { custom: { values: [3] } },
      ignorePatterns: ["!generated/keep.ts"],
    });

    expect(config.env).toStrictEqual({ node: false, browser: false });
    expect(config.globals).toStrictEqual({
      shared: "off",
      parentOnly: "readonly",
    });
    expect(config.settings).toStrictEqual({
      react: { version: "18.2" },
      custom: { values: [3] },
    });
    expect(config.ignorePatterns).toStrictEqual([
      "generated/**",
      "!generated/keep.ts",
    ]);
    expect(parent).toStrictEqual({
      env: { node: true },
      globals: { shared: "readonly", parentOnly: "readonly" },
      settings: { react: { version: "18.2" }, custom: { values: [1, 2] } },
      ignorePatterns: ["generated/**"],
    });
  });

  test("plugin_settings_replacement", () => {
    expect.hasAssertions();

    const config = inheritConfig({
      extends: [{ settings: { react: { version: "18.2" } } }],
      settings: { react: { linkComponents: ["Link"] } },
    });

    expect(config.settings?.react).toStrictEqual({ linkComponents: ["Link"] });
  });

  test("native_fields", () => {
    expect.hasAssertions();

    const input: OxlintConfig = {
      categories: { correctness: "warn" },
      extends: [
        {
          rules: {
            "no-console": "deny", // Inherited rules remain native Oxlint input.
          },
        },
      ],
      jsPlugins: [{ name: "custom", specifier: "custom-plugin" }],
      options: { typeAware: false, maxWarnings: 1 },
      overrides: [
        {
          files: ["*.ts"],
          rules: {
            "no-console": "allow", // Preserve file-scoped exceptions.
          },
        },
      ],
      plugins: ["typescript"],
      rules: {
        "no-debugger": "deny", // Preserve the package rule map.
      },
    };
    const config = inheritConfig(input);

    expect(config).toMatchObject(input);
    expect(config.extends).toBe(input.extends);
    expect(config.overrides).toBe(input.overrides);
  });

  test("shared_ancestor", () => {
    expect.hasAssertions();

    const parent: OxlintConfig = { env: { node: true } };
    const config = inheritConfig({
      extends: [
        { extends: [parent], env: { node: false } },
        { extends: [parent] },
      ],
    });

    expect(config.env).toStrictEqual({ node: true });
  });

  test("circular_extension", () => {
    expect.hasAssertions();

    const parent: OxlintConfig = {};
    const child: OxlintConfig = { extends: [parent] };
    parent.extends = [child];

    expect(() => inheritConfig(child)).toThrow(
      "Circular Oxlint configuration inheritance.",
    );
  });
});
