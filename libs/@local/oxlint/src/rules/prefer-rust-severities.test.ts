import { RuleTester } from "oxlint/plugins-dev";

import { preferRustSeverities } from "./prefer-rust-severities.js";

const tester = new RuleTester();
const severityError = { messageId: "severity" };
const configuration = (rules: string): string =>
  `import { defineConfig } from "oxlint";
defineConfig({ rules: {
${rules}
} });`;
const aliases = [
  ["off", "allow"],
  ["error", "deny"],
  [0, "allow"],
  [1, "warn"],
  [2, "deny"],
] as const;

// oxlint-disable-next-line vitest/require-hook -- RuleTester declares and runs test cases rather than setting up shared state.
tester.run("prefer-rust-severities", preferRustSeverities, {
  invalid: [
    ...aliases.map(([severity, replacement]) => ({
      code: configuration(`one: ${JSON.stringify(severity)}, // Local policy.`),
      errors: [severityError],
      output: configuration(`one: "${replacement}", // Local policy.`),
    })),
    ...aliases.map(([severity, replacement]) => ({
      code: configuration(
        `one: [${JSON.stringify(severity)}, // Local policy.\n{ mode: "off", level: "error" }],`,
      ),
      errors: [severityError],
      output: configuration(
        `one: ["${replacement}", // Local policy.\n{ mode: "off", level: "error" }],`,
      ),
    })),
    {
      code: configuration('one: [("off" as const)] as const,'),
      errors: [severityError],
      filename: "config-factory.ts",
      output: configuration('one: [("allow" as const)] as const,'),
    },
    {
      code: 'import type { DummyRuleMap } from "oxlint"; defineRules(({ one: "error" }) satisfies DummyRuleMap);',
      errors: [severityError],
      filename: "config-factory.ts",
      output:
        'import type { DummyRuleMap } from "oxlint"; defineRules(({ one: "deny" }) satisfies DummyRuleMap);',
    },
    {
      code: 'import { createConfig } from "@local/oxlint"; const rules = { one: 0 } as const;',
      errors: [severityError],
      filename: "config-factory.ts",
      output:
        'import { createConfig } from "@local/oxlint"; const rules = { one: "allow" } as const;',
    },
    {
      code: 'export default { overrides: [{ files: ["test.ts"], rules: { one: 2 } }] };',
      errors: [severityError],
      filename: "oxlint.config.ts",
      output:
        'export default { overrides: [{ files: ["test.ts"], rules: { one: "deny" } }] };',
    },
    {
      code: 'export default { rules: { one: "off" } };',
      errors: [severityError],
      filename: ".oxlintrc.mjs",
      output: 'export default { rules: { one: "allow" } };',
    },
    ...['"warning"', "3"].map((severity) => ({
      code: configuration(`one: ${severity},`),
      errors: [severityError],
      output: null,
    })),
  ],
  valid: [
    ...["allow", "warn", "deny"].map((severity) =>
      configuration(`one: "${severity}",`),
    ),
    configuration('one: ["deny", { mode: "off", level: "error" }],'),
    configuration("one: inheritedSetting,\n...inheritedRules,"),
    configuration("one: [],"),
    'import { defineConfig } from "oxlint"; defineConfig({ options: { reportUnusedDisableDirectives: "error" }, globals: { shared: "off" } });',
    'const validation = { rules: { one: "off" } };',
    'defineRules({ one: "off" });',
    'import { defineConfig } from "vitest/config"; defineConfig({ rules: { one: "off" } });',
    'import { defineConfig } from "oxlint"; const plugin = { rules: { one: implementation } };',
  ],
});
