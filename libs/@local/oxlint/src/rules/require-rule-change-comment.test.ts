import { RuleTester } from "oxlint/plugins-dev";

import { requireRuleChangeComment } from "./require-rule-change-comment.js";

const tester = new RuleTester();
const explanation = { messageId: "explanation" };
const configuration = (rules: string): string =>
  `import { defineConfig } from "oxlint";
defineConfig({ rules: {
${rules}
} });`;

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("require-rule-change-comment", requireRuleChangeComment, {
  invalid: [
    {
      code: 'import { defineConfig } from "oxlint";\n\nexport default defineConfig({\n  rules: {\n    // This CLI writes results to stdout.\n    "no-console": "allow",\n    "max-params": [\n      "deny",\n      { max: 3 },\n    ], // Additional parameters belong in an options object.\n  },\n});',
      errors: [explanation, explanation],
    },
    {
      code: 'import { defineConfig } from "oxlint"; const rules = { one: "off" } as const;',
      errors: [explanation],
      filename: "config-factory.ts",
    },
    {
      code: 'import { defineConfig } from "oxlint"; defineConfig({ rules: { one: "off" as const } satisfies DummyRuleMap });',
      errors: [explanation],
      filename: "config-factory.ts",
    },
    {
      code: 'import { defineConfig } from "oxlint"; defineConfig({ rules: { one: ["off" as const] as const } });',
      errors: [explanation],
      filename: "config-factory.ts",
    },
    {
      code: 'import { defineConfig } from "oxlint"; defineConfig({ rules: ({ one: ("off") }) });',
      errors: [explanation],
    },
    ...["allow", "off", "warn", "deny", "error"].map((severity) => ({
      code: configuration(`"one": "${severity}",`),
      errors: [explanation],
    })),
    ...[0, 1, 2].map((severity) => ({
      code: configuration(`"one": ${severity},`),
      errors: [explanation],
    })),
    {
      code: configuration('"one": "off", //   '),
      errors: [explanation],
    },
    {
      code: configuration('"one": "off", /* */'),
      errors: [explanation],
    },
    {
      code: configuration('// CLI output is intentional.\n"one": "off",'),
      errors: [explanation],
    },
    {
      code: configuration('"one": "off",\n// CLI output is intentional.'),
      errors: [explanation],
    },
    {
      code: configuration(
        '"one": [\n  "deny",\n  { max: 2 },\n], // Too far from the modifier.',
      ),
      errors: [explanation],
    },
    {
      code: configuration(
        '"one": "off", "two": "off", // This explains only two.',
      ),
      errors: [explanation],
    },
    {
      code: 'import type { DummyRuleMap } from "oxlint"; defineRules({ one: "off" });',
      errors: [explanation],
      filename: "config-factory.ts",
    },
    {
      code: 'import { defineConfig } from "@local/oxlint"; const rules = { one: "off" };',
      errors: [explanation],
    },
    {
      code: 'export default { overrides: [{ files: ["test.ts"], rules: { one: "off" } }] };',
      errors: [explanation],
      filename: "oxlint.config.ts",
    },
    {
      code: configuration(
        '"one": "off", /*\nReason starts on the next line.\n*/',
      ),
      errors: [explanation],
    },
    {
      code: 'export default { rules: { one: "off" } }; // Outside the rule map.',
      errors: [explanation],
      filename: ".oxlintrc.mjs",
    },
  ],
  valid: [
    'import { defineConfig } from "oxlint";\n\nexport default defineConfig({\n  rules: {\n    "no-console": "allow", // This CLI writes results to stdout.\n    "max-params": [\n      "deny", // Additional parameters belong in an options object.\n      { max: 3 },\n    ],\n  },\n});',
    {
      code: 'import { defineConfig } from "oxlint"; const rules = { one: "off" as const, // CLI output is intentional.\n} as const;',
      filename: "config-factory.ts",
    },
    {
      code: 'import { defineConfig } from "oxlint"; defineRules(({ one: ["off", // CLI output is intentional.\n] }) satisfies DummyRuleMap);',
      filename: "config-factory.ts",
    },
    configuration('"one": "off", // CLI output is intentional.'),
    configuration('"one": "warn", /* Migration remains in progress. */'),
    configuration('"one": ["deny", { max: 2 }], // Limit public API arity.'),
    configuration(
      '"one": [\n  "deny", // Limit public API arity.\n  { max: 2 },\n],',
    ),
    configuration(
      '"one": "off", /* First reason. */ "two": "off", // Second reason.',
    ),
    configuration('"one": inheritedSetting,\n...inheritedRules,'),
    configuration('"one": [],'),
    'const validation = { rules: { one: "off" } };',
    'defineRules({ one: "off" });',
    'import { defineConfig } from "vitest/config"; defineConfig({ rules: { one: "off" } });',
    'import { defineConfig } from "oxlint"; const categories = { correctness: "deny" };',
    'import { defineConfig } from "oxlint"; const plugin = { rules: { one: implementation } };',
    'import { defineConfig } from "oxlint"; const config = { rules: { ...otherRules } };',
  ],
});
