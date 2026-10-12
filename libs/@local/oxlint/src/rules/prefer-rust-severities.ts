/**
 * Keeps literal rule severities in the `allow`, `warn`, and `deny` vocabulary.
 *
 * Fixes ESLint aliases without changing their severity or surrounding options. Computed settings and inherited presets are not resolved.
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
          if (value !== "allow" && value !== "warn" && value !== "deny") {
            let replacement: Severity | undefined;
            if (typeof value === "string" || typeof value === "number") {
              replacement = replacements.get(value);
            }

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
