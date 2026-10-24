/**
 * Keeps literal rule severities in the `allow`, `warn`, and `deny` vocabulary.
 *
 * Fixes ESLint aliases without changing their severity or surrounding options, but does not resolve computed settings or inherited presets.
 *
 * @example Incorrect
 * ```ts
 * import { defineConfig } from "oxlint";
 *
 * export default defineConfig({
 *   rules: {
 *     "no-console": "off", // This CLI writes results to stdout.
 *     "eqeqeq": 1, // Loose comparisons remain during migration.
 *     "max-params": [
 *       "error", // Additional parameters belong in an options object.
 *       { max: 3 },
 *     ],
 *   },
 * });
 * ```
 *
 * @example Correct
 * ```ts
 * import { defineConfig } from "oxlint";
 *
 * export default defineConfig({
 *   rules: {
 *     "no-console": "allow", // This CLI writes results to stdout.
 *     "eqeqeq": "warn", // Loose comparisons remain during migration.
 *     "max-params": [
 *       "deny", // Additional parameters belong in an options object.
 *       { max: 3 },
 *     ],
 *   },
 * });
 * ```
 *
 * @module
 */

import { defineRule } from "@oxlint/plugins";

import {
  isOxlintConfiguration,
  ruleSettings,
} from "../lib/rule-configuration.js";

type Severity = "allow" | "warn" | "deny";

const replacements: ReadonlyMap<string | number, Severity> = new Map<
  string | number,
  Severity
>([
  ["off", "allow"],
  ["error", "deny"],
  [0, "allow"],
  [1, "warn"],
  [2, "deny"],
]);

export const preferRustSeverities = defineRule({
  createOnce: (context) => {
    let configuration = false;

    return {
      Program: (program): void => {
        configuration = isOxlintConfiguration(program, context.filename);
      },
      ObjectExpression: (node): void => {
        if (!configuration) {
          return;
        }

        for (const { severity } of ruleSettings(node)) {
          const { value } = severity;
          if (
            (typeof value === "string" || typeof value === "number") &&
            value !== "allow" &&
            value !== "warn" &&
            value !== "deny"
          ) {
            const replacement = replacements.get(value);

            context.report({
              messageId: "severity",
              node: severity,
              fix: (fixer) => {
                if (replacement === undefined) {
                  return null;
                }

                return fixer.replaceText(severity, JSON.stringify(replacement));
              },
            });
          }
        }
      },
    };
  },
  meta: {
    fixable: "code",
    messages: {
      severity: 'Use only "allow", "warn", or "deny" for rule severities.',
    },
    schema: [],
    type: "suggestion",
  },
});
